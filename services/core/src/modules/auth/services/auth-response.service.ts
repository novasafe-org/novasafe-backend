import type { Request } from 'express';
import { Types } from 'mongoose';
import { authConfig } from '../../../config/auth.config';
import { getRequestContext } from '../../../shared/request-context';
import { logger } from '../../../shared/logger';
import { resolveClientIp, resolveDeviceInfo } from '../helpers/device.helper';
import { assertEntitlement } from '../adapters/subscription.adapter';
import { toAuthUser } from '../helpers/auth-user.helper';
import type { ISession } from '../../../database/schemas/sessions';
import { getSessionRepository } from '../repositories/session.repository';
import { getJwtTokenService } from '../tokens/jwt.token.service';
import type { AuthSubscriptionBlockedResponse, AuthSuccessResponse, VaultOAuthUserRow } from '../types/auth.types';

export class AuthResponseService {
  constructor(
    private readonly sessions = getSessionRepository(),
    private readonly tokens = getJwtTokenService(),
  ) {}

  async buildFullSession(
    req: Request,
    user: VaultOAuthUserRow,
    options?: { requiresMasterPasswordSetup?: boolean; requiresVaultSetup?: boolean; oauthIntent?: string },
  ): Promise<AuthSuccessResponse | AuthSubscriptionBlockedResponse> {
    const tokenResult = this.tokens.generateAccessToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture || user.avatar_url,
    });

    const userId = user._id.toString();
    const multiDevice = await assertEntitlement(userId, 'canUseMultiDevice');
    if (!multiDevice.ok) {
      const activeSessions = await this.sessions.countActiveByUserId(userId);
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

    const ipAddress = resolveClientIp(req);
    const device = resolveDeviceInfo(req);
    const platformCtx = getRequestContext();
    const sessionPayload: Record<string, unknown> = {
      userId: new Types.ObjectId(user._id.toString()),
      tokenId: tokenResult.tokenId,
      revoked: false,
      source: platformCtx?.legacySource ?? req.source ?? 'mobile',
      ipAddress,
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
      createdAt: new Date(),
      lastActivity: new Date(),
      ...(platformCtx ? platformCtx.toSessionFields() : {}),
    };
    await this.sessions.create(sessionPayload as Partial<ISession>);

    logger.info('Auth session created', { userId, platform: device.platform });

    return {
      success: true,
      source: req.source,
      token: tokenResult.token,
      accessToken: tokenResult.token,
      refreshToken: null,
      user: toAuthUser(user),
      requiresMasterPasswordSetup: Boolean(options?.requiresMasterPasswordSetup),
      requiresVaultSetup: Boolean(options?.requiresVaultSetup),
      oauthIntent: options?.oauthIntent,
    };
  }

  buildOauthPendingResponse(
    req: Request,
    user: VaultOAuthUserRow,
    provider: 'google' | 'apple',
    oauthIntent: string,
  ) {
    const tokenPack = this.tokens.generateOauthPendingToken(
      {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        picture: user.picture || user.avatar_url,
      },
      provider,
    );
    return {
      success: true as const,
      source: req.source,
      requiresOtpVerification: true,
      tempSessionToken: tokenPack.token,
      authProvider: provider,
      oauthIntent,
      user: toAuthUser(user),
    };
  }

  static randomOtp(): string {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  otpExpiresAt(): Date {
    return new Date(Date.now() + authConfig.otp.ttlMs);
  }
}

let authResponseService: AuthResponseService | null = null;
export const getAuthResponseService = (): AuthResponseService => {
  if (!authResponseService) authResponseService = new AuthResponseService();
  return authResponseService;
};
