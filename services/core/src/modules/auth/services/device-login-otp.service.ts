import type { Request } from 'express';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { authConfig } from '../../../config/auth.config';
import { logger } from '../../../shared/logger';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { getOtpRepository } from '../repositories/otp.repository';
import { getUserRepository } from '../repositories/user.repository';
import { getTrustedDeviceRepository } from '../repositories/trusted-device.repository';
import { AuthResponseService } from './auth-response.service';
import { sendDeviceLoginApprovalOTPEmail } from './email.service';
import { getOtpService } from './otp.service';
import { resolveDeviceKey, hasLiveApproverDevice } from './device-trust.service';

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
};

export const issueDeviceLoginApprovalOtp = async (
  userId: string,
): Promise<{ sent: boolean; destinationHint: string | null }> => {
  const user = await getUserRepository().findByIdActive(userId);
  if (!user?.email) {
    return { sent: false, destinationHint: null };
  }
  const email = String(user.email).toLowerCase().trim();
  const otp = getOtpService();
  const cooldown = await otp.checkResendCooldown(email, OtpPurpose.DeviceLoginApproval);
  if (cooldown != null) {
    return { sent: false, destinationHint: maskEmail(email) };
  }

  const code = AuthResponseService.randomOtp();
  const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
  await getOtpRepository().upsert(email, OtpPurpose.DeviceLoginApproval, code, expiresAt, {
    verifyAttempts: 0,
    lastSentAt: new Date(),
  });
  const sent = await sendDeviceLoginApprovalOTPEmail(email, code);
  if (!sent) {
    logger.error('Failed to send device-login approval OTP', { userId, email });
  }
  return { sent, destinationHint: maskEmail(email) };
};

export class DeviceLoginOtpService {
  async requestOtp(req: Request, alertIdRaw: string) {
    const userId = req.user?.id;
    if (!userId) {
      return { status: 401, body: { success: false, message: 'Authentication required' } };
    }
    const alertId = String(alertIdRaw || '').trim();
    if (!ObjectId.isValid(alertId)) {
      return { status: 400, body: { success: false, message: 'Invalid alert id' } };
    }

    const deviceKey = resolveDeviceKey(req);
    const db = getNativeMongo();
    const alert = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
      _id: new ObjectId(alertId),
      userId: new ObjectId(userId),
    });
    if (!alert) {
      return { status: 404, body: { success: false, message: 'Alert not found' } };
    }
    if (String(alert.status) !== 'pending') {
      return {
        status: 400,
        body: { success: false, message: 'Alert already resolved', status: String(alert.status) },
      };
    }
    if (alert.deviceKey && String(alert.deviceKey) !== deviceKey) {
      return {
        status: 403,
        body: { success: false, message: 'This alert belongs to another device' },
      };
    }

    // OTP is for when no live It’s me approver is available (or user opts in).
    const canBeApproved = await hasLiveApproverDevice(userId, deviceKey);
    const result = await issueDeviceLoginApprovalOtp(userId);
    return {
      status: 200,
      body: {
        success: true,
        message: result.sent
          ? 'Verification code sent'
          : 'If a code was recently sent, wait before requesting another.',
        fallback: 'otp',
        otpSent: result.sent,
        destinationHint: result.destinationHint,
        liveApproverAvailable: canBeApproved,
      },
    };
  }

  async verifyOtp(req: Request, alertIdRaw: string, otpRaw: string) {
    const userId = req.user?.id;
    if (!userId) {
      return { status: 401, body: { success: false, message: 'Authentication required' } };
    }
    const alertId = String(alertIdRaw || '').trim();
    const otpCode = String(otpRaw || '').trim();
    if (!ObjectId.isValid(alertId)) {
      return { status: 400, body: { success: false, message: 'Invalid alert id' } };
    }
    if (!/^\d{6}$/.test(otpCode)) {
      return { status: 400, body: { success: false, message: 'Enter the 6-digit code' } };
    }

    const deviceKey = resolveDeviceKey(req);
    const db = getNativeMongo();
    const alert = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
      _id: new ObjectId(alertId),
      userId: new ObjectId(userId),
    });
    if (!alert) {
      return { status: 404, body: { success: false, message: 'Alert not found' } };
    }
    if (String(alert.status) === 'confirmed') {
      return { status: 200, body: { success: true, status: 'confirmed', message: 'Already approved' } };
    }
    if (String(alert.status) !== 'pending') {
      return {
        status: 400,
        body: { success: false, message: 'Alert already resolved', status: String(alert.status) },
      };
    }
    if (alert.deviceKey && String(alert.deviceKey) !== deviceKey) {
      return {
        status: 403,
        body: { success: false, message: 'This alert belongs to another device' },
      };
    }

    const user = await getUserRepository().findByIdActive(userId);
    if (!user?.email) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }
    const email = String(user.email).toLowerCase().trim();
    const otpRepo = getOtpRepository();
    const otpDoc = await otpRepo.findValid(email, OtpPurpose.DeviceLoginApproval);
    if (!otpDoc) {
      return { status: 400, body: { success: false, message: 'Invalid or expired verification code' } };
    }
    const attempts = Number(otpDoc.verifyAttempts ?? 0);
    if (attempts >= authConfig.otp.maxVerifyAttempts) {
      return {
        status: 429,
        body: { success: false, message: 'Too many attempts. Request a new code.' },
      };
    }
    if (String(otpDoc.code) !== otpCode) {
      await otpRepo.incrementAttempts(otpDoc._id);
      return { status: 400, body: { success: false, message: 'Invalid or expired verification code' } };
    }
    await otpRepo.deleteByEmailPurpose(email, OtpPurpose.DeviceLoginApproval);

    const pendingDeviceKey = String(alert.deviceKey || deviceKey);
    await getTrustedDeviceRepository().markTrusted(userId, pendingDeviceKey);
    await db.updateOne(
      COLLECTIONS.deviceLoginAlerts,
      { _id: new ObjectId(alertId), userId: new ObjectId(userId), status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          resolvedAt: new Date(),
          resolvedVia: 'email_otp',
        },
      },
    );

    logger.info('Device login approved via email OTP', {
      userId,
      alertId,
      deviceKey: pendingDeviceKey,
    });

    return {
      status: 200,
      body: {
        success: true,
        status: 'confirmed',
        message: 'Device approved',
      },
    };
  }
}

let deviceLoginOtpService: DeviceLoginOtpService | null = null;
export const getDeviceLoginOtpService = (): DeviceLoginOtpService => {
  if (!deviceLoginOtpService) deviceLoginOtpService = new DeviceLoginOtpService();
  return deviceLoginOtpService;
};
