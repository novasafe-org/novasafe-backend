import crypto from 'node:crypto';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { authConfig } from '../../../config/auth.config';
import { getRequestContext } from '../../../shared/request-context';
import { ClientPlatform, RequestSource } from '../../../shared/request-context/types/request-source.types';
import { logger } from '../../../shared/logger';
import { resolveClientIp, resolveDeviceInfo } from '../helpers/device.helper';
import { toAuthUser } from '../helpers/auth-user.helper';
import type { ISession } from '../../../database/schemas/sessions';
import { getSessionRepository } from '../repositories/session.repository';
import { getJwtTokenService } from '../tokens/jwt.token.service';
import type {
  AuthDeviceBlockedResponse,
  AuthSuccessResponse,
  VaultOAuthUserRow,
} from '../types/auth.types';
import {
  evaluateDeviceLogin,
  registerTrustedDeviceForLogin,
  resolveDeviceKey,
  touchSessionDeviceId,
} from './device-trust.service';

export class AuthResponseService {
  constructor(
    private readonly sessions = getSessionRepository(),
    private readonly tokens = getJwtTokenService(),
  ) {}

  async buildFullSession(
    req: Request,
    user: VaultOAuthUserRow,
    options?: { requiresMasterPasswordSetup?: boolean; requiresVaultSetup?: boolean; oauthIntent?: string },
  ): Promise<AuthSuccessResponse | AuthDeviceBlockedResponse> {
    const userId = user._id.toString();
    const deviceDecision = await evaluateDeviceLogin(req, userId);

    if (deviceDecision.allowed === false) {
      logger.warn('Login blocked — new device over free plan limit', {
        userId,
        code: deviceDecision.code,
        trustedDeviceCount: deviceDecision.policy.trustedDeviceCount,
      });
      return {
        success: false,
        source: req.source,
        code: deviceDecision.code,
        message: deviceDecision.message,
        entitlement: 'canUseMultiDevice',
        subscription: deviceDecision.subscription,
        devicePolicy: deviceDecision.policy,
      };
    }

    const deviceKey = deviceDecision.deviceKey;
    const platformCtx = getRequestContext();
    const snap = platformCtx?.snapshot;
    const isWebClient =
      snap?.platform === ClientPlatform.Web || snap?.declaredSource === RequestSource.WebApp;
    const tokenResult = this.tokens.generateAccessToken(
      {
        id: userId,
        email: user.email,
        name: user.name,
        picture: user.picture || user.avatar_url,
      },
      isWebClient ? { expiresIn: authConfig.jwt.webAccessExpiresIn } : undefined,
    );

    const ipAddress = resolveClientIp(req);
    const device = resolveDeviceInfo(req);
    const sessionPayload: Record<string, unknown> = {
      userId: new ObjectId(userId),
      tokenId: tokenResult.tokenId,
      revoked: false,
      source: platformCtx?.legacySource ?? req.source ?? 'mobile',
      ipAddress,
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
      deviceId: deviceKey,
      createdAt: new Date(),
      lastActivity: new Date(),
      ...(platformCtx ? platformCtx.toSessionFields() : {}),
    };
    await this.sessions.create(sessionPayload as Partial<ISession>);
    await registerTrustedDeviceForLogin(req, userId, deviceKey);
    await touchSessionDeviceId(tokenResult.tokenId, deviceKey);

    logger.info('Auth session created', {
      userId,
      platform: device.platform,
      deviceKey,
      trustedDeviceCount: deviceDecision.policy.trustedDeviceCount,
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
      oauthIntent: options?.oauthIntent,
      devicePolicy: deviceDecision.policy,
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
    return `${crypto.randomInt(100_000, 1_000_000)}`;
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

// Re-export for callers that need device key before session exists
export { resolveDeviceKey };
