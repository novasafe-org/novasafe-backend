import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { verifyAppleIdentityToken } from '../services/appleIdentityToken';
import { sendSignupOTPEmail, sendTwoFactorEmail } from '../services/emailService';
import { assertEntitlement } from '../services/subscriptionService';
import { generateOauthPendingToken, generateToken } from '../utils/token';
import type { OauthOtpProvider } from '../utils/token';

const db = new Database(DB_CONFIG.databaseName);

const randomSignupOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;

/**
 * NovaSafe product-level email verification (OTP), separate from Google's `email_verified` claim.
 * `undefined`/null ⇒ legacy accounts (treated verified for backward compatibility).
 */
const isNovaSafeEmailVerified = (user: { novasafeEmailVerified?: boolean | null } | null | undefined): boolean => {
  if (user?.novasafeEmailVerified === true) return true;
  if (user?.novasafeEmailVerified === false) return false;
  return true;
};

/** Typed shape for OAuth / OTP branching (Mongo `findOne` is otherwise `Document`). */
type VaultOAuthUserRow = {
  _id: ObjectId;
  email: string;
  name?: string;
  picture?: string;
  avatar_url?: string;
  novasafeEmailVerified?: boolean | null;
  passwordHash?: unknown;
  has_password?: boolean;
  isFirstOAuthSignup?: boolean;
  auth_methods?: unknown;
  auth_provider?: string;
  provider_id?: string;
  googleId?: string;
  appleId?: string;
};

type NovaSafeOauthOtpPurpose = 'google_oauth' | 'apple_oauth';

const upsertNovaSafeOauthOtpAndSend = async (emailRaw: string, purpose: NovaSafeOauthOtpPurpose): Promise<boolean> => {
  const email = String(emailRaw).toLowerCase().trim();
  const code = randomSignupOtp();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.getDb().collection(DB_CONFIG.collections.otpCodes).updateOne(
    { email, purpose },
    {
      $set: {
        email,
        purpose,
        code,
        expiresAt,
        verifyAttempts: 0,
        updatedAt: now,
        lastSentAt: now,
      },
    },
    { upsert: true },
  );
  return sendSignupOTPEmail(email, code);
};
const googleClient = new OAuth2Client();
const resolveGoogleAudiences = () =>
  [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.VITE_GOOGLE_WEB_CLIENT_ID,
    process.env.VITE_GOOGLE_ANDROID_CLIENT_ID,
  ].filter((value): value is string => Boolean(value && value.trim()));

const resolveClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) return String(forwarded[0]);
  return req.socket.remoteAddress || 'Unknown';
};

const resolveDeviceInfo = (req: Request) => {
  const ua = String(req.headers['user-agent'] || 'Unknown Device');
  const lower = ua.toLowerCase();
  const requestPlatform = String(req.body?.devicePlatform || '').toLowerCase().trim();
  const requestModel = String(req.body?.deviceModel || '').trim();
  const requestOsVersion = String(req.body?.deviceOsVersion || '').trim();
  const platform = lower.includes('android')
    ? 'android'
    : lower.includes('iphone') || lower.includes('ios')
      ? 'ios'
      : lower.includes('windows')
        ? 'windows'
        : lower.includes('mac')
          ? 'macos'
          : 'web';
  const normalizedPlatform = requestPlatform || platform;
  const deviceName = requestModel
    ? `${requestModel}${requestOsVersion ? ` - ${normalizedPlatform} ${requestOsVersion}` : ` - ${normalizedPlatform}`}`
    : ua.slice(0, 80);
  return { deviceName, platform: normalizedPlatform, userAgent: ua };
};

const toAuthUser = (user: any) => ({
  id: user._id?.toString() || user.googleId,
  email: user.email,
  name: user.name,
  picture: user.picture || user.avatar_url,
});

const buildAuthResponse = async (
  req: Request,
  user: any,
  options?: { requiresMasterPasswordSetup?: boolean; requiresVaultSetup?: boolean }
) => {
  const tokenResult = generateToken({
    id: user._id?.toString() || user.googleId,
    email: user.email,
    name: user.name,
    picture: user.picture || user.avatar_url,
  });

  const ipAddress = resolveClientIp(req);
  const device = resolveDeviceInfo(req);

  const userId = user._id?.toString?.();
  if (userId) {
    const multiDevice = await assertEntitlement(userId, 'canUseMultiDevice');
    if (!multiDevice.ok) {
      const activeSessions = await db
        .getDb()
        .collection(DB_CONFIG.collections.sessions)
        .countDocuments({
          userId: new ObjectId(user._id),
          revoked: { $ne: true },
        });
      if (activeSessions >= 1) {
        return {
          success: false,
          source: req.source,
          code: 'NOVASAFE_SUBSCRIPTION_REQUIRED',
          message: 'Multiple device sessions require NovaSafe Pro.',
          entitlement: 'canUseMultiDevice',
          subscription: multiDevice.state,
        };
      }
    }
  }

  await db.insertOne(DB_CONFIG.collections.sessions, {
    userId: new ObjectId(user._id),
    tokenId: tokenResult.tokenId,
    revoked: false,
    source: 'mobile',
    ipAddress,
    deviceName: device.deviceName,
    platform: device.platform,
    userAgent: device.userAgent,
    createdAt: new Date(),
    lastActivity: new Date(),
  });

  return {
    success: true,
    source: req.source,
    token: tokenResult.token,
    accessToken: tokenResult.token,
    refreshToken: null,
    user: toAuthUser(user),
    requiresMasterPasswordSetup: Boolean(options?.requiresMasterPasswordSetup),
    requiresVaultSetup: Boolean(options?.requiresVaultSetup),
  };
};

export const mobileLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return void res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, {
    email: String(email).toLowerCase().trim(),
    deleted: { $ne: true },
  });
  if (!user?.passwordHash) {
    return void res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return void res.status(401).json({ success: false, message: 'Invalid email or password' });

  if (user.twoFactorEnabled) {
    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    await db.getDb().collection(DB_CONFIG.collections.twoFactorChallenges).insertOne({
      userId: new ObjectId(user._id),
      email: user.email,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verified: false,
      createdAt: new Date(),
      source: 'mobile',
    });
    const sent = await sendTwoFactorEmail(user.email, code);
    if (!sent) {
      return void res.status(500).json({ success: false, message: 'Unable to send 2FA code email. Check SMTP configuration.' });
    }
    return void res.status(200).json({
      success: true,
      source: req.source,
      requiresTwoFactor: true,
      message: 'Two-factor verification required',
      user: {
        id: user._id?.toString() || user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  }

  const authResponse = await buildAuthResponse(req, user);
  res.status(200).json(authResponse);
};

export const mobileVerifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const code = String(req.body?.code || '').trim();
  if (!email || !code) return void res.status(400).json({ success: false, message: 'Email and code are required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { email });
  if (!user?._id) return void res.status(404).json({ success: false, message: 'User not found' });
  const challenge = await db.findOne(DB_CONFIG.collections.twoFactorChallenges, {
    userId: new ObjectId(user._id),
    code,
    verified: false,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });

  await db.updateOne(
    DB_CONFIG.collections.twoFactorChallenges,
    { _id: challenge._id },
    { $set: { verified: true, verifiedAt: new Date() } },
  );

  const authResponse = await buildAuthResponse(req, user);
  res.status(200).json(authResponse);
};

export const mobileValidateSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.user.id)) return void res.status(401).json({ success: false, message: 'Invalid session user id' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: new ObjectId(req.user.id), deleted: { $ne: true } });
  if (!user) return void res.status(404).json({ success: false, message: 'User not found' });

  const userDto = {
    id: user._id?.toString() || user.googleId,
    email: user.email,
    name: user.name,
    picture: user.picture || user.avatar_url,
  };

  if (req.oauthOtpPending) {
    res.status(200).json({
      success: true,
      source: req.source,
      pendingNovaSafeEmailVerification: true,
      pendingOtpProvider: (req.oauthOtpProvider || 'google') as OauthOtpProvider,
      user: userDto,
    });
    return;
  }

  res.status(200).json({
    success: true,
    source: req.source,
    user: userDto,
  });
};

export const mobileLogout = async (req: Request, res: Response): Promise<void> => {
  if (!req.oauthOtpPending && req.tokenId) {
    await db.updateOne(
      DB_CONFIG.collections.sessions,
      { tokenId: req.tokenId },
      { $set: { revoked: true, revokedAt: new Date() } },
    );
  }
  res.status(200).json({ success: true, source: req.source, message: 'Logout successful' });
};

export const mobileGoogleResendOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id || !req.user.email) return void res.status(401).json({ success: false, message: 'Unauthorized' });
  if ((req.oauthOtpProvider || 'google') !== 'google') {
    return void res.status(400).json({ success: false, message: 'Use the Apple resend flow for this session.' });
  }
  const email = String(req.user.email).toLowerCase().trim();

  const record = await db.findOne(DB_CONFIG.collections.otpCodes, { email, purpose: 'google_oauth' });
  if (record?.lastSentAt) {
    const elapsed = Date.now() - new Date(record.lastSentAt as Date).getTime();
    if (elapsed < 30_000) {
      const waitSec = Math.max(1, Math.ceil((30_000 - elapsed) / 1000));
      return void res.status(429).json({
        success: false,
        message: `Please wait ${waitSec}s before resending.`,
        retryAfterSeconds: waitSec,
      });
    }
  }

  const sent = await upsertNovaSafeOauthOtpAndSend(email, 'google_oauth');
  if (!sent) {
    return void res.status(500).json({ success: false, message: 'Unable to send OTP email. Check SMTP configuration.' });
  }

  res.status(200).json({ success: true, source: req.source, message: 'OTP sent to your email' });
};

export const mobileCompleteOAuthWelcome = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id || !ObjectId.isValid(req.user.id)) {
    return void res.status(401).json({ success: false, message: 'Authentication required' });
  }
  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: new ObjectId(req.user.id), deleted: { $ne: true } },
    { $set: { isFirstOAuthSignup: false, updatedAt: new Date() } },
  );
  res.status(200).json({ success: true, source: req.source });
};

export const mobileGoogleVerifyOtp = async (req: Request, res: Response): Promise<void> => {
  const pendingProvider = req.oauthOtpProvider || 'google';
  if (pendingProvider !== 'google') {
    return void res.status(400).json({ success: false, message: 'Use the Apple verification flow for this session.' });
  }
  const userId = req.user?.id;
  const otp = String(req.body?.otp || '').trim();
  if (!userId || !ObjectId.isValid(userId)) {
    return void res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!/^\d{6}$/.test(otp)) {
    return void res.status(400).json({ success: false, message: 'Enter the 6-digit code' });
  }

  let user = (await db.findOne(DB_CONFIG.collections.vaultUsers, {
    _id: new ObjectId(userId),
    deleted: { $ne: true },
  })) as VaultOAuthUserRow | null;
  if (!user?._id) return void res.status(404).json({ success: false, message: 'User not found' });

  const wasFirstOAuthSignup = Boolean(user.isFirstOAuthSignup);

  const email = String(user.email).toLowerCase().trim();
  const otpDoc = await db.findOne(DB_CONFIG.collections.otpCodes, {
    email,
    purpose: 'google_oauth',
    expiresAt: { $gt: new Date() },
  });

  if (!otpDoc) {
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  const attempts = Number(otpDoc.verifyAttempts ?? 0);
  if (attempts >= 8) {
    return void res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
  }

  if (String(otpDoc.code) !== otp) {
    await db.updateOne(DB_CONFIG.collections.otpCodes, { _id: otpDoc._id }, { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } });
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: user._id },
    { $set: { novasafeEmailVerified: true, updatedAt: new Date(), source: 'mobile' } },
  );

  await db.getDb().collection(DB_CONFIG.collections.otpCodes).deleteMany({ email, purpose: 'google_oauth' });

  user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: user._id })) as VaultOAuthUserRow | null;
  if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to finalize account' });

  const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
  const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);

  const authResponse = await buildAuthResponse(req, user, {
    requiresMasterPasswordSetup,
    requiresVaultSetup,
  });

  res.status(200).json({
    ...authResponse,
    oauthIntent: wasFirstOAuthSignup ? 'google_register_verified' : 'google_returning_verified',
  });
};

type GoogleOtpPendingIntent = 'google_register_pending_email' | 'google_returning_pending_email';

const respondRequiresGoogleNovaSafeOtp = async (
  req: Request,
  res: Response,
  user: VaultOAuthUserRow,
  oauthIntent: GoogleOtpPendingIntent,
): Promise<void> => {
  const sent = await upsertNovaSafeOauthOtpAndSend(user.email, 'google_oauth');
  if (!sent) {
    res.status(500).json({ success: false, message: 'Unable to send OTP email. Check SMTP configuration.' });
    return;
  }
  const tokenPack = generateOauthPendingToken(
    {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture || user.avatar_url,
    },
    'google',
  );

  res.status(200).json({
    success: true,
    source: req.source,
    requiresOtpVerification: true,
    tempSessionToken: tokenPack.token,
    authProvider: 'google',
    oauthIntent,
    user: toAuthUser(user),
  });
};

export const mobileGoogleOAuth = async (req: Request, res: Response): Promise<void> => {
  const idToken = String(req.body?.idToken || '').trim();
  if (!idToken) return void res.status(400).json({ success: false, message: 'Google idToken is required' });

  const audiences = resolveGoogleAudiences();
  if (!audiences.length) {
    return void res.status(500).json({ success: false, message: 'Google OAuth audience is not configured on server' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      return void res.status(401).json({ success: false, message: 'Google token missing required claims' });
    }
    if (!payload.email_verified) {
      return void res.status(401).json({ success: false, message: 'Google account email is not verified' });
    }

    const now = new Date();
    const email = payload.email.toLowerCase().trim();
    const providerId = payload.sub;
    const fullName = payload.name || payload.given_name || email.split('@')[0];
    const avatar = payload.picture || null;

    let user = (await db.findOne(DB_CONFIG.collections.vaultUsers, {
      $or: [{ email }, { provider_id: providerId }, { googleId: providerId }],
      deleted: { $ne: true },
    })) as VaultOAuthUserRow | null;

    if (!user) {
      const insert = await db.insertOne(DB_CONFIG.collections.vaultUsers, {
        email,
        name: fullName,
        avatar_url: avatar,
        picture: avatar,
        auth_provider: 'google',
        provider_id: providerId,
        googleId: providerId,
        auth_methods: ['google'],
        has_password: false,
        email_verified: Boolean(payload.email_verified),
        novasafeEmailVerified: false,
        isFirstOAuthSignup: true,
        cloudSyncEnabled: false,
        cloudSyncUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
        source: 'mobile',
      });
      user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: insert.insertedId })) as VaultOAuthUserRow | null;
      console.info('[OAuth][Google] Created pending NovaSafe OTP user', { userId: insert.insertedId.toString() });

      if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });
      await respondRequiresGoogleNovaSafeOtp(req, res, user, 'google_register_pending_email');
      return;
    }

    const existingMethods = Array.isArray(user.auth_methods)
      ? user.auth_methods
      : user.passwordHash
        ? ['local']
        : [];
    const authMethods = existingMethods.includes('google') ? existingMethods : [...existingMethods, 'google'];
    const hasPassword = typeof user.has_password === 'boolean' ? user.has_password : Boolean(user.passwordHash);

    await db.updateOne(
      DB_CONFIG.collections.vaultUsers,
      { _id: user._id },
      {
        $set: {
          provider_id: user.provider_id || providerId,
          googleId: user.googleId || providerId,
          auth_provider: hasPassword ? user.auth_provider || 'local' : 'google',
          auth_methods: authMethods,
          has_password: hasPassword,
          email_verified: Boolean(payload.email_verified),
          picture: user.picture || avatar,
          avatar_url: user.avatar_url || avatar,
          updatedAt: now,
        },
      },
    );
    user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: user._id })) as VaultOAuthUserRow | null;
    console.info('[OAuth][Google] Linked/logged in existing user', { userId: user?._id?.toString() });

    if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });

    if (!isNovaSafeEmailVerified(user)) {
      await respondRequiresGoogleNovaSafeOtp(req, res, user, 'google_returning_pending_email');
      return;
    }

    const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
    const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);
    const authResponse = await buildAuthResponse(req, user, {
      requiresMasterPasswordSetup,
      requiresVaultSetup,
    });

    res.status(200).json({
      ...authResponse,
      oauthIntent: 'google_signed_in' as const,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Google authentication failed';
    console.error('[OAuth][Google] Verification failed', { message });
    res.status(401).json({ success: false, message: 'Invalid or expired Google token' });
  }
};

type AppleOtpPendingIntent = 'apple_register_pending_email' | 'apple_returning_pending_email';

const respondRequiresAppleNovaSafeOtp = async (
  req: Request,
  res: Response,
  user: VaultOAuthUserRow,
  oauthIntent: AppleOtpPendingIntent,
): Promise<void> => {
  const sent = await upsertNovaSafeOauthOtpAndSend(user.email, 'apple_oauth');
  if (!sent) {
    res.status(500).json({ success: false, message: 'Unable to send OTP email. Check SMTP configuration.' });
    return;
  }
  const tokenPack = generateOauthPendingToken(
    {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture || user.avatar_url,
    },
    'apple',
  );

  res.status(200).json({
    success: true,
    source: req.source,
    requiresOtpVerification: true,
    tempSessionToken: tokenPack.token,
    authProvider: 'apple',
    oauthIntent,
    user: toAuthUser(user),
  });
};

const buildAppleDisplayName = (emailLocal: string, given?: string, family?: string): string => {
  const g = String(given || '').trim();
  const f = String(family || '').trim();
  const combined = `${g} ${f}`.trim();
  if (combined) return combined;
  return emailLocal;
};

export const mobileAppleResendOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id || !req.user.email) return void res.status(401).json({ success: false, message: 'Unauthorized' });
  if ((req.oauthOtpProvider || 'google') !== 'apple') {
    return void res.status(400).json({ success: false, message: 'Use the Google resend flow for this session.' });
  }
  const email = String(req.user.email).toLowerCase().trim();

  const record = await db.findOne(DB_CONFIG.collections.otpCodes, { email, purpose: 'apple_oauth' });
  if (record?.lastSentAt) {
    const elapsed = Date.now() - new Date(record.lastSentAt as Date).getTime();
    if (elapsed < 30_000) {
      const waitSec = Math.max(1, Math.ceil((30_000 - elapsed) / 1000));
      return void res.status(429).json({
        success: false,
        message: `Please wait ${waitSec}s before resending.`,
        retryAfterSeconds: waitSec,
      });
    }
  }

  const sent = await upsertNovaSafeOauthOtpAndSend(email, 'apple_oauth');
  if (!sent) {
    return void res.status(500).json({ success: false, message: 'Unable to send OTP email. Check SMTP configuration.' });
  }

  res.status(200).json({ success: true, source: req.source, message: 'OTP sent to your email' });
};

export const mobileAppleVerifyOtp = async (req: Request, res: Response): Promise<void> => {
  if ((req.oauthOtpProvider || 'google') !== 'apple') {
    return void res.status(400).json({ success: false, message: 'Use the Google verification flow for this session.' });
  }
  const userId = req.user?.id;
  const otp = String(req.body?.otp || '').trim();
  if (!userId || !ObjectId.isValid(userId)) {
    return void res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!/^\d{6}$/.test(otp)) {
    return void res.status(400).json({ success: false, message: 'Enter the 6-digit code' });
  }

  let user = (await db.findOne(DB_CONFIG.collections.vaultUsers, {
    _id: new ObjectId(userId),
    deleted: { $ne: true },
  })) as VaultOAuthUserRow | null;
  if (!user?._id) return void res.status(404).json({ success: false, message: 'User not found' });

  const wasFirstOAuthSignup = Boolean(user.isFirstOAuthSignup);

  const email = String(user.email).toLowerCase().trim();
  const otpDoc = await db.findOne(DB_CONFIG.collections.otpCodes, {
    email,
    purpose: 'apple_oauth',
    expiresAt: { $gt: new Date() },
  });

  if (!otpDoc) {
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  const attempts = Number(otpDoc.verifyAttempts ?? 0);
  if (attempts >= 8) {
    return void res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
  }

  if (String(otpDoc.code) !== otp) {
    await db.updateOne(DB_CONFIG.collections.otpCodes, { _id: otpDoc._id }, { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } });
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: user._id },
    { $set: { novasafeEmailVerified: true, updatedAt: new Date(), source: 'mobile' } },
  );

  await db.getDb().collection(DB_CONFIG.collections.otpCodes).deleteMany({ email, purpose: 'apple_oauth' });

  user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: user._id })) as VaultOAuthUserRow | null;
  if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to finalize account' });

  const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
  const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);

  const authResponse = await buildAuthResponse(req, user, {
    requiresMasterPasswordSetup,
    requiresVaultSetup,
  });

  res.status(200).json({
    ...authResponse,
    oauthIntent: wasFirstOAuthSignup ? 'apple_register_verified' : 'apple_returning_verified',
  });
};

export const mobileAppleOAuth = async (req: Request, res: Response): Promise<void> => {
  const identityToken = String(req.body?.identityToken || '').trim();
  const rawNonce = typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '';
  const givenName = typeof req.body?.givenName === 'string' ? req.body.givenName.trim() : '';
  const familyName = typeof req.body?.familyName === 'string' ? req.body.familyName.trim() : '';

  if (!identityToken) {
    return void res.status(400).json({ success: false, message: 'Apple identityToken is required' });
  }
  if (!rawNonce) {
    return void res.status(400).json({ success: false, message: 'Apple Sign In nonce is required' });
  }

  try {
    const claims = await verifyAppleIdentityToken(identityToken, { rawNonce });
    const sub = claims.sub;
    const emailFromToken = claims.email;
    if (!emailFromToken) {
      return void res.status(400).json({
        success: false,
        message:
          'Apple did not share an email for this sign-in. Open Settings → Apple Account → Password & Security → Apps Using Apple ID, remove NovaSafe if listed, then sign in again and choose “Share My Email” or use Hide My Email (a relay address is fine).',
      });
    }

    const now = new Date();
    const email = emailFromToken.toLowerCase().trim();
    const emailLocal = email.split('@')[0] || 'User';
    const fullName = buildAppleDisplayName(emailLocal, givenName, familyName);

    const orClauses: Record<string, unknown>[] = [{ appleId: sub }, { email }];
    let user = (await db.findOne(DB_CONFIG.collections.vaultUsers, {
      $or: orClauses,
      deleted: { $ne: true },
    })) as VaultOAuthUserRow | null;

    const appleEmailTrusted = claims.emailVerified;

    if (!user) {
      if (!appleEmailTrusted) {
        const insert = await db.insertOne(DB_CONFIG.collections.vaultUsers, {
          email,
          name: fullName,
          avatar_url: null,
          picture: null,
          auth_provider: 'apple',
          provider_id: sub,
          appleId: sub,
          auth_methods: ['apple'],
          has_password: false,
          email_verified: true,
          novasafeEmailVerified: false,
          isFirstOAuthSignup: true,
          cloudSyncEnabled: false,
          cloudSyncUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          source: 'mobile',
        });
        user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: insert.insertedId })) as VaultOAuthUserRow | null;
        console.info('[OAuth][Apple] Created user pending NovaSafe OTP', { userId: insert.insertedId.toString() });
        if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });
        await respondRequiresAppleNovaSafeOtp(req, res, user, 'apple_register_pending_email');
        return;
      }

      const insert = await db.insertOne(DB_CONFIG.collections.vaultUsers, {
        email,
        name: fullName,
        avatar_url: null,
        picture: null,
        auth_provider: 'apple',
        provider_id: sub,
        appleId: sub,
        auth_methods: ['apple'],
        has_password: false,
        email_verified: true,
        novasafeEmailVerified: true,
        isFirstOAuthSignup: true,
        cloudSyncEnabled: false,
        cloudSyncUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
        source: 'mobile',
      });
      user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: insert.insertedId })) as VaultOAuthUserRow | null;
      if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });
      const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
      const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);
      const authResponse = await buildAuthResponse(req, user, {
        requiresMasterPasswordSetup,
        requiresVaultSetup,
      });
      res.status(200).json({
        ...authResponse,
        oauthIntent: 'apple_register_verified' as const,
      });
      return;
    }

    const existingMethods = Array.isArray(user.auth_methods)
      ? user.auth_methods
      : user.passwordHash
        ? ['local']
        : [];
    const authMethods = existingMethods.includes('apple') ? existingMethods : [...existingMethods, 'apple'];
    const hasPassword = typeof user.has_password === 'boolean' ? user.has_password : Boolean(user.passwordHash);

    await db.updateOne(
      DB_CONFIG.collections.vaultUsers,
      { _id: user._id },
      {
        $set: {
          appleId: user.appleId || sub,
          provider_id: user.provider_id || sub,
          auth_provider: hasPassword ? user.auth_provider || 'local' : user.auth_provider === 'google' ? 'google' : 'apple',
          auth_methods: authMethods,
          has_password: hasPassword,
          email_verified: true,
          name: user.name || fullName,
          picture: user.picture || user.avatar_url,
          updatedAt: now,
        },
      },
    );
    user = (await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: user._id })) as VaultOAuthUserRow | null;
    console.info('[OAuth][Apple] Linked/logged in existing user', { userId: user?._id?.toString() });

    if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });

    if (!isNovaSafeEmailVerified(user)) {
      await respondRequiresAppleNovaSafeOtp(req, res, user, 'apple_returning_pending_email');
      return;
    }

    const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
    const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);
    const authResponse = await buildAuthResponse(req, user, {
      requiresMasterPasswordSetup,
      requiresVaultSetup,
    });

    res.status(200).json({
      ...authResponse,
      oauthIntent: 'apple_signed_in' as const,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Apple authentication failed';
    console.error('[OAuth][Apple] Verification failed', { message });
    res.status(401).json({ success: false, message: 'Invalid or expired Apple identity token' });
  }
};
