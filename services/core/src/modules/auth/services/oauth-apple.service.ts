import type { Request } from 'express';
import { Types } from 'mongoose';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { logger } from '../../../shared/logger';
import { buildAppleDisplayName, isNovaSafeEmailVerified } from '../helpers/auth-user.helper';
import { getAppleAuthProvider } from '../providers/apple.provider';
import { getUserRepository } from '../repositories/user.repository';
import { getOtpService } from './otp.service';
import { getAuthResponseService } from './auth-response.service';
import type { VaultOAuthUserRow } from '../types/auth.types';

export class OAuthAppleService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly apple = getAppleAuthProvider(),
    private readonly otp = getOtpService(),
    private readonly authResponse = getAuthResponseService(),
  ) {}

  private async respondRequiresOtp(req: Request, user: VaultOAuthUserRow, oauthIntent: string) {
    const sent = await this.otp.upsertAndSend(user.email, OtpPurpose.AppleOauth);
    if (!sent) {
      return { status: 500, body: { success: false, message: 'Unable to send OTP email. Check SMTP configuration.' } };
    }
    return {
      status: 200,
      body: this.authResponse.buildOauthPendingResponse(req, user, 'apple', oauthIntent),
    };
  }

  async signIn(
    req: Request,
    identityToken: string,
    rawNonce: string,
    givenName?: string,
    familyName?: string,
  ) {
    if (!identityToken) {
      return { status: 400, body: { success: false, message: 'Apple identityToken is required' } };
    }
    if (!rawNonce) {
      return { status: 400, body: { success: false, message: 'Apple Sign In nonce is required' } };
    }
    try {
      const claims = await this.apple.verifyIdentityToken(identityToken, rawNonce);
      if (!claims.email) {
        return {
          status: 400,
          body: {
            success: false,
            message:
              'Apple did not share an email for this sign-in. Remove NovaSafe from Apps Using Apple ID and sign in again with Share My Email.',
          },
        };
      }

      const now = new Date();
      const email = claims.email;
      const emailLocal = email.split('@')[0] || 'User';
      const fullName = buildAppleDisplayName(emailLocal, givenName, familyName);
      const sub = claims.sub;

      let user = await this.users.findOAuthUser({
        $or: [{ appleId: sub }, { email }],
      });

      if (!user) {
        if (!claims.emailVerified) {
          user = await this.users.create({
            email,
            name: fullName,
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
          return this.respondRequiresOtp(req, user, 'apple_register_pending_email');
        }

        user = await this.users.create({
          email,
          name: fullName,
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
        const authResult = await this.authResponse.buildFullSession(req, user, {
          requiresMasterPasswordSetup: true,
          requiresVaultSetup: true,
          oauthIntent: 'apple_register_verified',
        });
        return { status: 200, body: authResult };
      }

      const existingMethods = Array.isArray(user.auth_methods)
        ? user.auth_methods
        : user.passwordHash
          ? ['local']
          : [];
      const authMethods = existingMethods.includes('apple') ? existingMethods : [...existingMethods, 'apple'];
      const hasPassword =
        typeof user.has_password === 'boolean' ? user.has_password : Boolean(user.passwordHash);

      await this.users.updateById(user._id.toString(), {
        $set: {
          appleId: user.appleId || sub,
          provider_id: user.provider_id || sub,
          auth_provider: hasPassword
            ? user.auth_provider || 'local'
            : user.auth_provider === 'google'
              ? 'google'
              : 'apple',
          auth_methods: authMethods,
          has_password: hasPassword,
          email_verified: true,
          name: user.name || fullName,
          updatedAt: now,
        },
      });

      user = (await this.users.findByIdActive(user._id.toString())) as VaultOAuthUserRow;
      if (!user) {
        return { status: 500, body: { success: false, message: 'Unable to prepare OAuth session' } };
      }

      if (!isNovaSafeEmailVerified(user)) {
        return this.respondRequiresOtp(req, user, 'apple_returning_pending_email');
      }

      const authResult = await this.authResponse.buildFullSession(req, user, {
        requiresMasterPasswordSetup: !Boolean(user.passwordHash || user.has_password),
        requiresVaultSetup: Boolean(user.isFirstOAuthSignup),
        oauthIntent: 'apple_signed_in',
      });
      return { status: 200, body: authResult };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Apple authentication failed';
      logger.error('OAuth Apple verification failed', { message });
      return { status: 401, body: { success: false, message: 'Invalid or expired Apple identity token' } };
    }
  }

  async verifyOtp(req: Request, userId: string, otp: string, provider: string) {
    if (provider !== 'apple') {
      return { status: 400, body: { success: false, message: 'Use the Google verification flow for this session.' } };
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
    const verify = await this.otp.verifyOauthOtp(email, OtpPurpose.AppleOauth, otp);
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
      oauthIntent: wasFirstOAuthSignup ? 'apple_register_verified' : 'apple_returning_verified',
    });
    return { status: 200, body: authResult };
  }

  async resendOtp(req: Request, email: string, provider: string) {
    if (provider !== 'apple') {
      return { status: 400, body: { success: false, message: 'Use the Google resend flow for this session.' } };
    }
    const normalized = email.toLowerCase().trim();
    const waitSec = await this.otp.checkResendCooldown(normalized, OtpPurpose.AppleOauth);
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
    const sent = await this.otp.upsertAndSend(normalized, OtpPurpose.AppleOauth);
    if (!sent) {
      return { status: 500, body: { success: false, message: 'Unable to send OTP email. Check SMTP configuration.' } };
    }
    return { status: 200, body: { success: true, source: req.source, message: 'OTP sent to your email' } };
  }
}

let oauthAppleService: OAuthAppleService | null = null;
export const getOAuthAppleService = (): OAuthAppleService => {
  if (!oauthAppleService) oauthAppleService = new OAuthAppleService();
  return oauthAppleService;
};
