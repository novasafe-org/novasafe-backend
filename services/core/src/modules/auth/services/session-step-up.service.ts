import type { Request } from 'express';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { logger } from '../../../shared/logger';
import { isMobileAppClient } from '../helpers/mobile-client.helper';
import { resolveDeviceKey } from './device-trust.service';
import { getOtpService } from './otp.service';
import { getSessionRepository } from '../repositories/session.repository';
import { getUserRepository } from '../repositories/user.repository';
import { getJwtTokenService } from '../tokens/jwt.token.service';
import { getTokenRefreshService } from './token-refresh.service';
import {
  getDeviceAttestationService,
  toAttestationHttpResult,
} from './device-attestation.service';
import { sendSessionStepUpOTPEmail } from './email.service';
import { AuthResponseService } from './auth-response.service';
import { authConfig } from '../../../config/auth.config';
import { getOtpRepository } from '../repositories/otp.repository';

/**
 * OTP fallback for session rotation when biometrics are unavailable / failed.
 */
export class SessionStepUpService {
  constructor(
    private readonly sessions = getSessionRepository(),
    private readonly users = getUserRepository(),
    private readonly tokens = getJwtTokenService(),
    private readonly otp = getOtpService(),
    private readonly otpRepo = getOtpRepository(),
    private readonly refresh = getTokenRefreshService(),
  ) {}

  async requestOtp(req: Request, refreshTokenRaw: string) {
    if (!isMobileAppClient(req)) {
      return {
        status: 403,
        body: {
          success: false,
          code: 'MOBILE_ONLY',
          message: 'Session step-up is only available on the NovaSafe mobile app.',
        },
      };
    }
    const attestation = await getDeviceAttestationService().assertForMobileSession(req);
    if (attestation && !attestation.ok) {
      return toAttestationHttpResult(attestation)!;
    }
    const refreshToken = String(refreshTokenRaw || '').trim();
    if (!refreshToken) {
      return { status: 400, body: { success: false, message: 'Refresh token required' } };
    }

    const session = await this.sessions.findActiveByRefreshHash(this.tokens.hashRefreshToken(refreshToken));
    if (!session) {
      return {
        status: 401,
        body: {
          success: false,
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Session expired. Sign in again.',
        },
      };
    }

    const deviceKey = resolveDeviceKey(req);
    if (!deviceKey || session.deviceId !== deviceKey) {
      return {
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_BINDING_MISMATCH',
          message: 'This session is bound to another device. Sign in again.',
        },
      };
    }

    const user = await this.users.findByIdActive(session.userId.toString());
    if (!user?.email) {
      return { status: 404, body: { success: false, code: 'USER_NOT_FOUND', message: 'User not found' } };
    }

    const cooldown = await this.otp.checkResendCooldown(user.email, OtpPurpose.SessionStepUp);
    if (cooldown != null) {
      return {
        status: 429,
        body: { success: false, message: `Wait ${cooldown}s before requesting another code.`, retryAfterSec: cooldown },
      };
    }

    const code = AuthResponseService.randomOtp();
    const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
    await this.otpRepo.upsert(user.email, OtpPurpose.SessionStepUp, code, expiresAt, {
      verifyAttempts: 0,
      lastSentAt: new Date(),
    });
    const sent = await sendSessionStepUpOTPEmail(user.email, code);
    if (!sent) {
      logger.error('Failed to send session step-up OTP', { email: user.email });
      return { status: 500, body: { success: false, message: 'Could not send verification code.' } };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Verification code sent',
        destinationHint: maskEmail(user.email),
      },
    };
  }

  async verifyOtp(req: Request, refreshTokenRaw: string, otpRaw: string) {
    if (!isMobileAppClient(req)) {
      return {
        status: 403,
        body: {
          success: false,
          code: 'MOBILE_ONLY',
          message: 'Session step-up is only available on the NovaSafe mobile app.',
        },
      };
    }
    const attestation = await getDeviceAttestationService().assertForMobileSession(req);
    if (attestation && !attestation.ok) {
      return toAttestationHttpResult(attestation)!;
    }
    const refreshToken = String(refreshTokenRaw || '').trim();
    const otp = String(otpRaw || '').trim();
    if (!refreshToken || !otp) {
      return { status: 400, body: { success: false, message: 'Refresh token and code are required' } };
    }

    const session = await this.sessions.findActiveByRefreshHash(this.tokens.hashRefreshToken(refreshToken));
    if (!session) {
      return {
        status: 401,
        body: {
          success: false,
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Session expired. Sign in again.',
        },
      };
    }

    const deviceKey = resolveDeviceKey(req);
    if (!deviceKey || session.deviceId !== deviceKey) {
      return {
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_BINDING_MISMATCH',
          message: 'This session is bound to another device. Sign in again.',
        },
      };
    }

    const user = await this.users.findByIdActive(session.userId.toString());
    if (!user?.email) {
      return { status: 404, body: { success: false, code: 'USER_NOT_FOUND', message: 'User not found' } };
    }

    const otpDoc = await this.otpRepo.findValid(user.email, OtpPurpose.SessionStepUp);
    if (!otpDoc) {
      return { status: 400, body: { success: false, message: 'Invalid or expired verification code' } };
    }
    const attempts = Number(otpDoc.verifyAttempts ?? 0);
    if (attempts >= authConfig.otp.maxVerifyAttempts) {
      return { status: 429, body: { success: false, message: 'Too many attempts. Request a new code.' } };
    }
    if (String(otpDoc.code) !== otp) {
      await this.otpRepo.incrementAttempts(otpDoc._id);
      return { status: 400, body: { success: false, message: 'Invalid or expired verification code' } };
    }
    await this.otpRepo.deleteByEmailPurpose(user.email, OtpPurpose.SessionStepUp);

    // Complete rotation with OTP step-up proof.
    return this.refresh.refresh(req, {
      refreshToken,
      stepUpMethod: 'otp',
      restoredFromBackup: Boolean(req.body?.restoredFromBackup),
    });
  }
}

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
};

let sessionStepUpService: SessionStepUpService | null = null;
export const getSessionStepUpService = (): SessionStepUpService => {
  if (!sessionStepUpService) sessionStepUpService = new SessionStepUpService();
  return sessionStepUpService;
};
