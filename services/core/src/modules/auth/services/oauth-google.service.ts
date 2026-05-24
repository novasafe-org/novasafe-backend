import type { Request } from 'express';
import { Types } from 'mongoose';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { logger } from '../../../shared/logger';
import { toReadableError } from '../../../shared/logger/utils/readable-error.util';
import { isNovaSafeEmailVerified } from '../helpers/auth-user.helper';
import { getGoogleAuthProvider } from '../providers/google.provider';
import { getUserRepository } from '../repositories/user.repository';
import { getOtpService } from './otp.service';
import { getAuthResponseService } from './auth-response.service';
import type { VaultOAuthUserRow } from '../types/auth.types';

export class OAuthGoogleService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly google = getGoogleAuthProvider(),
    private readonly otp = getOtpService(),
    private readonly authResponse = getAuthResponseService(),
  ) {}

  private async respondRequiresOtp(
    req: Request,
    user: VaultOAuthUserRow,
    oauthIntent: string,
  ) {
    const sent = await this.otp.upsertAndSend(user.email, OtpPurpose.GoogleOauth);
    if (!sent) {
      return { status: 500, body: { success: false, message: 'Unable to send OTP email. Check SMTP configuration.' } };
    }
    return {
      status: 200,
      body: this.authResponse.buildOauthPendingResponse(req, user, 'google', oauthIntent),
    };
  }

  async signIn(req: Request, idToken: string) {
    if (!idToken) {
      return { status: 400, body: { success: false, message: 'Google idToken is required' } };
    }
    try {
      const payload = await this.google.verifyIdToken(idToken);
      const now = new Date();
      const email = payload.email;
      const providerId = payload.sub;
      const fullName = payload.name || payload.givenName || email.split('@')[0];
      const avatar = payload.picture || null;

      let user = await this.users.findOAuthUser({
        $or: [{ email }, { provider_id: providerId }, { googleId: providerId }],
      });

      if (!user) {
        user = await this.users.create({
          email,
          name: fullName,
          avatar_url: avatar,
          picture: avatar,
          auth_provider: 'google',
          provider_id: providerId,
          googleId: providerId,
          auth_methods: ['google'],
          has_password: false,
          email_verified: payload.emailVerified,
          novasafeEmailVerified: false,
          isFirstOAuthSignup: true,
          cloudSyncEnabled: false,
          cloudSyncUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          source: 'mobile',
        });
        logger.info('OAuth Google: created pending OTP user', { userId: user._id.toString() });
        return this.respondRequiresOtp(req, user, 'google_register_pending_email');
      }

      const existingMethods = Array.isArray(user.auth_methods)
        ? user.auth_methods
        : user.passwordHash
          ? ['local']
          : [];
      const authMethods = existingMethods.includes('google') ? existingMethods : [...existingMethods, 'google'];
      const hasPassword =
        typeof user.has_password === 'boolean' ? user.has_password : Boolean(user.passwordHash);

      await this.users.updateById(user._id.toString(), {
        $set: {
          provider_id: user.provider_id || providerId,
          googleId: user.googleId || providerId,
          auth_provider: hasPassword ? user.auth_provider || 'local' : 'google',
          auth_methods: authMethods,
          has_password: hasPassword,
          email_verified: payload.emailVerified,
          picture: user.picture || avatar,
          avatar_url: user.avatar_url || avatar,
          updatedAt: now,
        },
      });

      user = (await this.users.findByIdActive(user._id.toString())) as VaultOAuthUserRow;
      if (!user) {
        return { status: 500, body: { success: false, message: 'Unable to prepare OAuth session' } };
      }

      if (!isNovaSafeEmailVerified(user)) {
        return this.respondRequiresOtp(req, user, 'google_returning_pending_email');
      }

      const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
      const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);
      const authResult = await this.authResponse.buildFullSession(req, user, {
        requiresMasterPasswordSetup,
        requiresVaultSetup,
        oauthIntent: 'google_signed_in',
      });
      return { status: 200, body: authResult };
    } catch (error: unknown) {
      const readable = toReadableError(error);
      logger.error(`OAuth Google failed: ${readable.message}`, {
        code: readable.code,
        category: readable.category,
      });
      const clientMessage =
        readable.code === 'DATABASE_UNAVAILABLE'
          ? readable.message
          : 'Invalid or expired Google token';
      const status = readable.code === 'DATABASE_UNAVAILABLE' ? 503 : 401;
      return { status, body: { success: false, message: clientMessage, code: readable.code } };
    }
  }

  async verifyOtp(req: Request, userId: string, otp: string, provider: string) {
    if (provider !== 'google') {
      return { status: 400, body: { success: false, message: 'Use the Apple verification flow for this session.' } };
    }
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return { status: 401, body: { success: false, message: 'Unauthorized' } };
    }
    if (!/^\d{6}$/.test(otp)) {
      return { status: 400, body: { success: false, message: 'Enter the 6-digit code' } };
    }
    let user = await this.users.findByIdActive(userId);
    if (!user) return { status: 404, body: { success: false, message: 'User not found' } };

    const wasFirstOAuthSignup = Boolean(user.isFirstOAuthSignup);
    const email = user.email.toLowerCase().trim();
    const verify = await this.otp.verifyOauthOtp(email, OtpPurpose.GoogleOauth, otp);
    if (verify.ok === false) {
      return { status: verify.status, body: { success: false, message: verify.message } };
    }

    await this.users.updateById(user._id.toString(), {
      $set: { novasafeEmailVerified: true, updatedAt: new Date(), source: 'mobile' },
    });
    user = (await this.users.findByIdActive(userId)) as VaultOAuthUserRow;
    if (!user) return { status: 500, body: { success: false, message: 'Unable to finalize account' } };

    const authResult = await this.authResponse.buildFullSession(req, user, {
      requiresMasterPasswordSetup: !Boolean(user.passwordHash || user.has_password),
      requiresVaultSetup: Boolean(user.isFirstOAuthSignup),
      oauthIntent: wasFirstOAuthSignup ? 'google_register_verified' : 'google_returning_verified',
    });
    return { status: 200, body: authResult };
  }

  async resendOtp(req: Request, email: string, provider: string) {
    if (provider !== 'google') {
      return { status: 400, body: { success: false, message: 'Use the Apple resend flow for this session.' } };
    }
    const normalized = email.toLowerCase().trim();
    const waitSec = await this.otp.checkResendCooldown(normalized, OtpPurpose.GoogleOauth);
    if (waitSec) {
      return {
        status: 429,
        body: {
          success: false,
          message: `Please wait ${waitSec}s before resending.`,
          retryAfterSeconds: waitSec,
        },
      };
    }
    const sent = await this.otp.upsertAndSend(normalized, OtpPurpose.GoogleOauth);
    if (!sent) {
      return { status: 500, body: { success: false, message: 'Unable to send OTP email. Check SMTP configuration.' } };
    }
    return { status: 200, body: { success: true, source: req.source, message: 'OTP sent to your email' } };
  }
}

let oauthGoogleService: OAuthGoogleService | null = null;
export const getOAuthGoogleService = (): OAuthGoogleService => {
  if (!oauthGoogleService) oauthGoogleService = new OAuthGoogleService();
  return oauthGoogleService;
};
