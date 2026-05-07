import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { sendTwoFactorEmail } from '../services/emailService';
import { generateToken } from '../utils/token';

const db = new Database('vault');
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
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: new ObjectId(req.user.id) });
  if (!user) return void res.status(404).json({ success: false, message: 'User not found' });

  res.status(200).json({
    success: true,
    source: req.source,
    user: {
      id: user._id?.toString() || user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  });
};

export const mobileLogout = async (req: Request, res: Response): Promise<void> => {
  if (!req.tokenId) return void res.status(200).json({ success: true, source: req.source, message: 'Logout successful' });
  await db.updateOne(DB_CONFIG.collections.sessions, { tokenId: req.tokenId }, { $set: { revoked: true, revokedAt: new Date() } });
  res.status(200).json({ success: true, source: req.source, message: 'Logout successful' });
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

    let user = await db.findOne(DB_CONFIG.collections.vaultUsers, {
      $or: [{ email }, { provider_id: providerId }, { googleId: providerId }],
      deleted: { $ne: true },
    });

    let isFirstOAuthLogin = false;
    if (!user) {
      const insert = await db.insertOne(DB_CONFIG.collections.vaultUsers, {
        email,
        name: fullName,
        avatar_url: avatar,
        picture: avatar,
        auth_provider: 'google',
        provider_id: providerId,
        auth_methods: ['google'],
        has_password: false,
        email_verified: true,
        cloudSyncEnabled: false,
        cloudSyncUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
        source: 'mobile',
      });
      user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: insert.insertedId });
      isFirstOAuthLogin = true;
      console.info('[OAuth][Google] Created new mobile user', { userId: insert.insertedId.toString() });
    } else {
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
            email_verified: true,
            picture: user.picture || avatar,
            avatar_url: user.avatar_url || avatar,
            updatedAt: now,
          },
        }
      );
      user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: user._id });
      console.info('[OAuth][Google] Linked/logged in existing user', { userId: user?._id?.toString() });
    }

    if (!user?._id) return void res.status(500).json({ success: false, message: 'Unable to prepare OAuth session' });

    const requiresMasterPasswordSetup = isFirstOAuthLogin || !Boolean(user.passwordHash || user.has_password);
    const authResponse = await buildAuthResponse(req, user, {
      requiresMasterPasswordSetup,
      requiresVaultSetup: isFirstOAuthLogin,
    });

    res.status(200).json(authResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Google authentication failed';
    console.error('[OAuth][Google] Verification failed', { message });
    res.status(401).json({ success: false, message: 'Invalid or expired Google token' });
  }
};
