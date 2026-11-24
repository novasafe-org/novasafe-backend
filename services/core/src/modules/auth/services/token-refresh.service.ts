import type { Request } from 'express';
import { authConfig } from '../../../config/auth.config';
import { getRequestContext } from '../../../shared/request-context';
import { ClientPlatform, RequestSource } from '../../../shared/request-context/types/request-source.types';
import { logger } from '../../../shared/logger';
import { resolveClientIp, resolveDeviceInfo } from '../helpers/device.helper';
import { toAuthUser } from '../helpers/auth-user.helper';
import { getSessionRepository } from '../repositories/session.repository';
import { getUserRepository } from '../repositories/user.repository';
import { getJwtTokenService } from '../tokens/jwt.token.service';
import { isMobileAppClient } from '../helpers/mobile-client.helper';
import { resolveDeviceKey } from './device-trust.service';
import {
  getDeviceAttestationService,
  toAttestationHttpResult,
} from './device-attestation.service';
import {
  evaluateSessionRisk,
  hashDeviceFingerprint,
  ipRangePrefix,
  parseRefreshExpiresInMs,
} from './session-risk.service';

export type RefreshBody = {
  refreshToken?: string;
  stepUpMethod?: 'biometric' | 'otp' | null;
  restoredFromBackup?: boolean;
  biometricFailed?: boolean;
};

/**
 * Refresh access token with refresh-token rotation + device binding.
 * When adaptive rotation is due / high risk, requires step-up proof.
 */
export class TokenRefreshService {
  constructor(
    private readonly sessions = getSessionRepository(),
    private readonly users = getUserRepository(),
    private readonly tokens = getJwtTokenService(),
  ) {}

  async refresh(req: Request, body: RefreshBody) {
    if (!isMobileAppClient(req)) {
      return {
        status: 403,
        body: {
          success: false,
          code: 'MOBILE_ONLY',
          message: 'Session refresh is only available on the NovaSafe mobile app.',
        },
      };
    }
    const attestation = await getDeviceAttestationService().assertForMobileSession(req);
    if (attestation && !attestation.ok) {
      return toAttestationHttpResult(attestation)!;
    }
    const refreshToken = String(body.refreshToken || '').trim();
    if (!refreshToken) {
      return { status: 400, body: { success: false, message: 'Refresh token required' } };
    }

    const hash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.sessions.findActiveByRefreshHash(hash);
    if (!session) {
      return {
        status: 401,
        body: { success: false, code: 'INVALID_REFRESH_TOKEN', message: 'Session expired. Sign in again.' },
      };
    }

    const deviceKey = resolveDeviceKey(req);
    if (!deviceKey || !session.deviceId || session.deviceId !== deviceKey) {
      logger.warn('Refresh rejected — device binding mismatch', {
        userId: session.userId?.toString(),
        sessionDevice: session.deviceId,
        requestDevice: deviceKey,
      });
      return {
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_BINDING_MISMATCH',
          message: 'This session is bound to another device. Sign in again.',
        },
      };
    }

    const userId = session.userId.toString();
    const user = await this.users.findByIdActive(userId);
    if (!user) {
      await this.sessions.revokeByTokenId(session.tokenId);
      return {
        status: 401,
        body: { success: false, code: 'USER_NOT_FOUND', message: 'User not found' },
      };
    }

    if (body.biometricFailed) {
      await this.sessions.incrementBiometricFail(session.tokenId);
      session.biometricFailCount = Number(session.biometricFailCount || 0) + 1;
    }

    const ipAddress = resolveClientIp(req);
    const device = resolveDeviceInfo(req);
    const osVersion = String(req.body?.deviceOsVersion || '').trim();
    const platformCtx = getRequestContext();
    const snap = platformCtx?.snapshot;
    const geoCountry = String(snap?.flags?.geoCountry || req.headers['x-client-country'] || '').trim().toUpperCase();
    const geoRegion = String(snap?.region || req.headers['x-client-region'] || '').trim().toUpperCase();

    const risk = evaluateSessionRisk(session, {
      deviceId: deviceKey,
      platform: device.platform,
      osVersion,
      ipAddress,
      geoCountry,
      geoRegion,
      restoredFromBackup: Boolean(body.restoredFromBackup),
      biometricFailed: Boolean(body.biometricFailed),
    });

    const stepUp = body.stepUpMethod || null;
    if (risk.forceStepUpNow) {
      const preferred = risk.preferredStepUp || 'biometric';
      const otpRequired = preferred === 'otp';
      const biometricOk = stepUp === 'biometric' && !otpRequired;
      const otpOk = stepUp === 'otp'; // OTP path uses dedicated verify endpoint; refresh accepts after verify issued new tokens
      if (!biometricOk && !otpOk) {
        return {
          status: 403,
          body: {
            success: false,
            code: 'SESSION_STEP_UP_REQUIRED',
            message:
              preferred === 'otp'
                ? 'Confirm it is you with a one-time code.'
                : 'Confirm it is you with biometrics.',
            preferredStepUp: preferred,
            riskSignals: risk.signals,
            sessionPolicy: {
              nextRotationAt: (session.nextRotationAt
                ? new Date(session.nextRotationAt)
                : risk.nextRotationAt
              ).toISOString(),
              rotationIntervalMs: risk.rotationIntervalMs,
              requiresStepUp: preferred,
              riskSignals: risk.signals,
            },
          },
        };
      }
    }

    const isWebClient =
      snap?.platform === ClientPlatform.Web || snap?.declaredSource === RequestSource.WebApp;
    const access = this.tokens.generateAccessToken(
      {
        id: userId,
        email: user.email,
        name: user.name,
        picture: user.picture || user.avatar_url,
      },
      isWebClient ? { expiresIn: authConfig.jwt.webAccessExpiresIn } : undefined,
    );
    const refresh = this.tokens.generateRefreshToken();
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + parseRefreshExpiresInMs());
    const fingerprint = hashDeviceFingerprint(deviceKey, device.platform, osVersion);

    // After successful biometric/OTP step-up, reset fail counter and schedule next window.
    const nextInterval =
      stepUp != null
        ? risk.signals.length > 0 && risk.preferredStepUp === 'otp'
          ? authConfig.session.shortRotationMs
          : authConfig.session.baseRotationMs
        : risk.rotationIntervalMs || authConfig.session.baseRotationMs;
    const nextRotationAt = new Date(now.getTime() + Math.max(nextInterval, authConfig.session.shortRotationMs > 0 ? 60_000 : 0));

    await this.sessions.rotateTokens(session.tokenId, {
      tokenId: access.tokenId,
      refreshTokenHash: refresh.tokenHash,
      refreshExpiresAt,
      refreshRotatedAt: now,
      deviceFingerprint: fingerprint,
      osVersion: osVersion || null,
      ipAddress,
      lastIpPrefix: ipRangePrefix(ipAddress),
      lastGeoCountry: geoCountry || null,
      lastGeoRegion: geoRegion || null,
      biometricFailCount: stepUp ? 0 : Number(session.biometricFailCount || 0),
      rotationIntervalMs: nextInterval || authConfig.session.baseRotationMs,
      nextRotationAt,
      riskSignals: risk.signals,
      preferredStepUp: null,
      deviceId: deviceKey,
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
    });

    if (stepUp) {
      await this.sessions.resetBiometricFail(access.tokenId);
    }

    logger.info('Session tokens rotated', {
      userId,
      deviceKey,
      signals: risk.signals,
      stepUp,
    });

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        token: access.token,
        accessToken: access.token,
        refreshToken: refresh.token,
        user: toAuthUser(user),
        sessionPolicy: {
          nextRotationAt: nextRotationAt.toISOString(),
          rotationIntervalMs: nextInterval || authConfig.session.baseRotationMs,
          requiresStepUp: null,
          riskSignals: risk.signals,
        },
      },
    };
  }
}

let tokenRefreshService: TokenRefreshService | null = null;
export const getTokenRefreshService = (): TokenRefreshService => {
  if (!tokenRefreshService) tokenRefreshService = new TokenRefreshService();
  return tokenRefreshService;
};
