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
import { getJwtTokenService } from '../tokens/jwt.token.service';
import type { VaultOAuthUserRow } from '../types/auth.types';

export type GoogleOauthFlow = 'login' | 'register';

function googleSubFilter(providerId: string) {
  return { $or: [{ provider_id: providerId }, { googleId: providerId }] };
}

function isGoogleLinkedToSub(user: VaultOAuthUserRow, providerId: string): boolean {
  return user.googleId === providerId || user.provider_id === providerId;
}

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

  private async finishVerifiedGoogleSession(req: Request, user: VaultOAuthUserRow, oauthIntent: string) {
    const requiresMasterPasswordSetup = !Boolean(user.passwordHash || user.has_password);
    const requiresVaultSetup = Boolean(user.isFirstOAuthSignup);
    const authResult = await this.authResponse.buildFullSession(req, user, {
      requiresMasterPasswordSetup,
      requiresVaultSetup,
      oauthIntent,
    });
    return { status: 200, body: authResult };
  }

  async signIn(req: Request, idToken: string, flow: GoogleOauthFlow = 'register') {
    if (!idToken) {
      return { status: 400, body: { success: false, message: 'Google idToken is required' } };
    }
    try {
      const payload = await this.google.verifyIdToken(idToken);
      const now = new Date();
      const email = payload.email.toLowerCase().trim();
      const providerId = payload.sub;
      const fullName = payload.name || payload.givenName || email.split('@')[0];
      const avatar = payload.picture || null;

      if (!payload.emailVerified) {
        return {
          status: 403,
          body: {
            success: false,
            code: 'GOOGLE_EMAIL_NOT_VERIFIED',
            message: 'Google did not verify this email address. Use another sign-in method.',
          },
        };
      }

      let user = await this.users.findOAuthUser(googleSubFilter(providerId));

      if (flow === 'login') {
        if (!user || !isGoogleLinkedToSub(user, providerId)) {
          const byEmail = await this.users.findByEmail(email);
          if (byEmail) {
            return {
              status: 403,
              body: {
                success: false,
                code: 'ACCOUNT_EXISTS_PROVIDER_NOT_LINKED',
                message:
                  'An account already exists with this email. Sign in with your existing method, then connect Google from account settings.',
              },
            };
          }
          return {
            status: 404,
            body: {
              success: false,
              code: 'NO_ACCOUNT',
              message: 'No NovaSafe account is connected to this Google account. Please create an account first.',
            },
          };
        }

        await this.users.updateById(user._id.toString(), {
          $set: {
            picture: user.picture || avatar,
            avatar_url: user.avatar_url || avatar,
            email_verified: payload.emailVerified,
            updatedAt: now,
          },
        });
        user = (await this.users.findByIdActive(user._id.toString())) as VaultOAuthUserRow;

        if (!isNovaSafeEmailVerified(user)) {
          return {
            status: 403,
            body: {
              success: false,
              code: 'ACCOUNT_NOT_VERIFIED',
              message:
                'This account is not ready to sign in yet. Please finish creating your account on the sign up page.',
            },
          };
        }

        return this.finishVerifiedGoogleSession(req, user, 'google_signed_in');
      }

      // --- register flow: validate Google identity only (account created after NovaSafe OTP) ---
      return await this.validateSignupIntent(req, email, providerId, fullName, avatar, payload.emailVerified);
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
      return {
        status,
        body: { success: false, message: clientMessage, code: readable.code || 'GOOGLE_TOKEN_INVALID' },
      };
    }
  }

  /**
   * Google sign-up step 1: validate ID token and return profile + short-lived intent JWT.
   * Does not create a user (NovaSafe signup OTP + create-account follows).
   */
  private async validateSignupIntent(
    req: Request,
    email: string,
    providerId: string,
    fullName: string,
    avatar: string | null,
    emailVerified: boolean,
  ) {
    if (!emailVerified) {
      return {
        status: 403,
        body: {
          success: false,
          code: 'GOOGLE_EMAIL_NOT_VERIFIED',
          message: 'Google did not verify this email address.',
        },
      };
    }

    const linkedUser = await this.users.findOAuthUser(googleSubFilter(providerId));
    if (linkedUser && isGoogleLinkedToSub(linkedUser, providerId)) {
      return {
        status: 409,
        body: {
          success: false,
          code: 'ACCOUNT_ALREADY_EXISTS',
          message: 'A NovaSafe account is already linked to this Google account. Please sign in instead.',
        },
      };
    }

    const byEmail = await this.users.findByEmail(email);
    if (byEmail) {
      return {
        status: 403,
        body: {
          success: false,
          code: 'ACCOUNT_EXISTS_PROVIDER_NOT_LINKED',
          message:
            'An account already exists with this email. Sign in with your existing method, then connect Google from account settings.',
        },
      };
    }

    const googleSignupIntentToken = getJwtTokenService().generateGoogleSignupIntentToken({
      googleSub: providerId,
      email,
      name: fullName,
      picture: avatar ?? undefined,
    });

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        signupIntent: true,
        email,
        fullName,
        picture: avatar,
        googleSignupIntentToken,
      },
    };
  }

  async linkGoogle(req: Request, idToken: string, authenticatedUserId: string) {
    if (!authenticatedUserId) {
      return {
        status: 401,
        body: {
          success: false,
          code: 'ACCOUNT_LINKING_REQUIRES_AUTHENTICATION',
          message: 'Sign in before connecting Google.',
        },
      };
    }
    if (!idToken) {
      return { status: 400, body: { success: false, message: 'Google idToken is required' } };
    }

    try {
      const payload = await this.google.verifyIdToken(idToken);
      const providerId = payload.sub;
      const email = payload.email.toLowerCase().trim();
      const now = new Date();

      if (!payload.emailVerified) {
        return {
          status: 403,
          body: {
            success: false,
            code: 'GOOGLE_EMAIL_NOT_VERIFIED',
            message: 'Google did not verify this email address.',
          },
        };
      }

      const owner = await this.users.findByIdActive(authenticatedUserId);
      if (!owner) {
        return { status: 404, body: { success: false, code: 'ACCOUNT_NOT_FOUND', message: 'User not found' } };
      }

      const linkedElsewhere = await this.users.findOAuthUser(googleSubFilter(providerId));
      if (linkedElsewhere && linkedElsewhere._id.toString() !== authenticatedUserId) {
        return {
          status: 409,
          body: {
            success: false,
            code: 'GOOGLE_IDENTITY_ALREADY_LINKED',
            message: 'This Google account is already connected to another NovaSafe account.',
          },
        };
      }

      if (owner.email.toLowerCase().trim() !== email) {
        return {
          status: 403,
          body: {
            success: false,
            code: 'GOOGLE_EMAIL_MISMATCH',
            message: 'This Google account email does not match your NovaSafe account email.',
          },
        };
      }

      const existingMethods = Array.isArray(owner.auth_methods)
        ? owner.auth_methods
        : owner.passwordHash
          ? ['local']
          : [];
      const authMethods = existingMethods.includes('google') ? existingMethods : [...existingMethods, 'google'];
      const hasPassword =
        typeof owner.has_password === 'boolean' ? owner.has_password : Boolean(owner.passwordHash);

      await this.users.updateById(authenticatedUserId, {
        $set: {
          provider_id: providerId,
          googleId: providerId,
          auth_methods: authMethods,
          has_password: hasPassword,
          auth_provider: hasPassword ? owner.auth_provider || 'local' : 'google',
          email_verified: payload.emailVerified,
          picture: owner.picture || payload.picture || null,
          avatar_url: owner.avatar_url || payload.picture || null,
          updatedAt: now,
        },
      });

      return {
        status: 200,
        body: {
          success: true,
          source: req.source,
          message: 'Google account connected.',
          authMethods,
          googleEmail: email,
        },
      };
    } catch (error: unknown) {
      const readable = toReadableError(error);
      return {
        status: 401,
        body: {
          success: false,
          message: 'Invalid or expired Google token',
          code: readable.code || 'GOOGLE_TOKEN_INVALID',
        },
      };
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
