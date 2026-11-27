import crypto from 'node:crypto';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { logger } from '../../../shared/logger';
import { getTrustedDeviceRepository } from '../repositories/trusted-device.repository';
import { resolveDeviceKey } from './device-trust.service';
import { getAuthResponseService } from './auth-response.service';

/** Default trust-token lifetime (90 days). */
export const DEVICE_TRUST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type DeviceTrustDto = {
  token: string;
  expiresAt: string;
};

export type SilentResumeFailureCode =
  | 'DEVICE_TRUST_MISSING'
  | 'DEVICE_TRUST_EXPIRED'
  | 'DEVICE_FINGERPRINT_MISMATCH'
  | 'DEVICE_COMPROMISED'
  | 'DEVICE_NOT_TRUSTED'
  | 'DEVICE_TRUST_UNKNOWN';

const sanitizeFingerprint = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 128);

/** Hardware fingerprint from header or body (client-computed). */
export const resolveHardwareFingerprint = (req: Request): string | null => {
  const header = req.headers['x-device-fingerprint'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    const cleaned = sanitizeFingerprint(fromHeader);
    return cleaned.length >= 16 ? cleaned : null;
  }
  const bodyFp = req.body?.hardwareFingerprint ?? req.body?.deviceFingerprint;
  if (typeof bodyFp === 'string' && bodyFp.trim()) {
    const cleaned = sanitizeFingerprint(bodyFp);
    return cleaned.length >= 16 ? cleaned : null;
  }
  return null;
};

export const hashTrustToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const mintDeviceTrustToken = (): { token: string; tokenHash: string; expiresAt: Date } => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DEVICE_TRUST_TTL_MS);
  return { token, tokenHash: hashTrustToken(token), expiresAt };
};

/**
 * Persist a rotated trust token on a trusted device row.
 * Call after login trust / consent approve / successful silent resume.
 */
export const issueDeviceTrustForDevice = async (input: {
  userId: string;
  deviceKey: string;
  hardwareFingerprint?: string | null;
}): Promise<DeviceTrustDto | null> => {
  const repo = getTrustedDeviceRepository();
  const row = await repo.findByUserAndKey(input.userId, input.deviceKey);
  if (!row?.trusted || !row.isActive || row.compromisedAt) return null;

  const minted = mintDeviceTrustToken();
  await repo.setDeviceTrustCredentials({
    userId: input.userId,
    deviceKey: input.deviceKey,
    trustTokenHash: minted.tokenHash,
    trustExpiresAt: minted.expiresAt,
    hardwareFingerprint: input.hardwareFingerprint || row.hardwareFingerprint || null,
  });

  return {
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
  };
};

/**
 * Mark device compromised: clears trust token and blocks silent resume.
 */
export const markDeviceCompromised = async (
  userId: string,
  deviceKey: string,
  reason: string,
): Promise<void> => {
  const repo = getTrustedDeviceRepository();
  await repo.markCompromised(userId, deviceKey);
  logger.warn('Device marked compromised — silent resume disabled', {
    userId,
    deviceKey,
    reason,
  });
};

type SilentResumeResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: { success: false; code: SilentResumeFailureCode; message: string } };

/**
 * Silent resume: prove device identity with trust token + hardware fingerprint
 * after a reinstall (no refresh token). Falls back to full login + consent when this fails.
 */
export class DeviceSilentResumeService {
  async resume(req: Request): Promise<SilentResumeResult> {
    const trustToken = String(req.body?.trustToken || '').trim();
    if (!trustToken) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'DEVICE_TRUST_MISSING',
          message: 'Device trust token is required for silent resume.',
        },
      };
    }

    const hardwareFingerprint = resolveHardwareFingerprint(req);
    if (!hardwareFingerprint) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'DEVICE_FINGERPRINT_MISMATCH',
          message: 'Hardware fingerprint is required for silent resume.',
        },
      };
    }

    const repo = getTrustedDeviceRepository();
    const tokenHash = hashTrustToken(trustToken);
    const device = await repo.findByTrustTokenHash(tokenHash);

    if (!device) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_TRUST_UNKNOWN',
          message: 'Device trust token is invalid. Sign in again.',
        },
      };
    }

    if (device.compromisedAt) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'DEVICE_COMPROMISED',
          message: 'This device was marked untrusted. Sign in and approve from a trusted device.',
        },
      };
    }

    if (!device.trusted || !device.isActive) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'DEVICE_NOT_TRUSTED',
          message: 'This device is not trusted. Complete allow-login from a trusted device.',
        },
      };
    }

    if (!device.trustExpiresAt || new Date(device.trustExpiresAt).getTime() < Date.now()) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_TRUST_EXPIRED',
          message: 'Device trust expired. Sign in again.',
        },
      };
    }

    const storedFp = device.hardwareFingerprint
      ? sanitizeFingerprint(String(device.hardwareFingerprint))
      : '';
    if (!storedFp || storedFp !== hardwareFingerprint) {
      logger.warn('Silent resume fingerprint mismatch', {
        userId: String(device.userId),
        deviceKey: device.deviceKey,
      });
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_FINGERPRINT_MISMATCH',
          message: 'Device fingerprint does not match. Sign in again.',
        },
      };
    }

    const userId = String(device.userId);
    const db = getNativeMongo();
    const user = await db.findOne(COLLECTIONS.vaultUsers, { _id: new ObjectId(userId) });
    if (!user) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          code: 'DEVICE_TRUST_UNKNOWN',
          message: 'Account not found for this device trust.',
        },
      };
    }

    // Bind current install UUID onto the trusted row (reinstall gets a new X-Device-Id).
    const newDeviceKey = resolveDeviceKey(req);
    if (newDeviceKey && newDeviceKey !== device.deviceKey) {
      await repo.rebindDeviceKey({
        userId,
        fromDeviceKey: String(device.deviceKey),
        toDeviceKey: newDeviceKey,
        hardwareFingerprint,
      });
    }

    // buildFullSession reuses device policy + JWT issuance; fingerprint match makes the device trusted.
    const session = await getAuthResponseService().buildFullSession(req, user as never);

    if (!session || typeof session !== 'object' || !('success' in session) || session.success !== true) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'DEVICE_NOT_TRUSTED',
          message:
            (session && typeof session === 'object' && 'message' in session
              ? String((session as { message?: string }).message)
              : null) || 'Unable to resume session on this device.',
        },
      };
    }

    const deviceTrust = await issueDeviceTrustForDevice({
      userId,
      deviceKey: newDeviceKey || String(device.deviceKey),
      hardwareFingerprint,
    });

    logger.info('Silent device resume succeeded', {
      userId,
      deviceKey: newDeviceKey || device.deviceKey,
      hardwareFingerprint: hardwareFingerprint.slice(0, 12),
    });

    return {
      ok: true,
      status: 200,
      body: {
        ...session,
        deviceTrust: deviceTrust ?? null,
        silentResume: true,
      },
    };
  }
}

let silentResumeService: DeviceSilentResumeService | null = null;
export const getDeviceSilentResumeService = (): DeviceSilentResumeService => {
  if (!silentResumeService) silentResumeService = new DeviceSilentResumeService();
  return silentResumeService;
};
