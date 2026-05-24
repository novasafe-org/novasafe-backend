import crypto from 'node:crypto';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { getRequestContext } from '../../../shared/request-context';
import { SUBSCRIPTION_CONFIG } from '../../subscriptions/config/subscription.config';
import { getSubscriptionStateForUser } from '../../subscriptions/services/subscription.service';
import type { SubscriptionState } from '../../subscriptions/revenuecat/types';
import { resolveDeviceInfo } from '../helpers/device.helper';
import { getTrustedDeviceRepository } from '../repositories/trusted-device.repository';
import { getSessionRepository } from '../repositories/session.repository';

export type DeviceLoginPolicy = {
  canRegisterNewDevice: boolean;
  trustedDeviceCount: number;
  maxTrustedDevices: number;
  isPro: boolean;
};

export type DeviceLoginDecision =
  | { allowed: true; policy: DeviceLoginPolicy; deviceKey: string }
  | {
      allowed: false;
      code: 'NOVASAFE_DEVICE_LIMIT';
      message: string;
      policy: DeviceLoginPolicy;
      subscription: SubscriptionState;
    };

const parseBoolean = (value: string | undefined): boolean =>
  ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

/** Dev / sandbox: skip device-slot enforcement (subscriptions still apply for premium features). */
export const shouldRelaxDeviceLimits = (): boolean => {
  if (parseBoolean(process.env.SUBSCRIPTION_RELAX_DEVICE_LIMITS)) return true;
  if (process.env.NODE_ENV === 'development' && process.env.SUBSCRIPTION_RELAX_DEVICE_LIMITS !== 'false') {
    return true;
  }
  return false;
};

const sanitizeDeviceKey = (value: string): string =>
  value.trim().slice(0, 128).replace(/[^\w.\-:@+/=]/g, '_');

/** Stable device identifier from headers, body, or platform fingerprint. */
export const resolveDeviceKey = (req: Request): string => {
  const ctx = getRequestContext();
  const fromHeader = ctx?.snapshot.deviceId || req.headers['x-device-id'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return sanitizeDeviceKey(fromHeader);
  }
  if (Array.isArray(fromHeader) && fromHeader[0]) {
    return sanitizeDeviceKey(String(fromHeader[0]));
  }

  const bodyDeviceId = req.body?.deviceId;
  if (typeof bodyDeviceId === 'string' && bodyDeviceId.trim()) {
    return sanitizeDeviceKey(bodyDeviceId);
  }

  const device = resolveDeviceInfo(req);
  const fingerprint = `${device.platform}|${device.userAgent}|${device.deviceName}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 40);
};

const seedTrustedDevicesFromSessions = async (userId: string): Promise<void> => {
  const repo = getTrustedDeviceRepository();
  const existing = await repo.countActiveByUserId(userId);
  if (existing > 0) return;

  const db = getNativeMongo();
  const sessions = await db.findMany(
    COLLECTIONS.sessions,
    { userId: new ObjectId(userId), revoked: { $ne: true } },
    { limit: 50, sort: { lastActivity: -1 } },
  );

  const seen = new Set<string>();
  let index = 0;
  for (const row of sessions) {
    const platform = String(row.platform || 'unknown');
    const userAgent = String(row.userAgent || '');
    const deviceId = row.deviceId ? String(row.deviceId) : '';
    const key = deviceId
      ? sanitizeDeviceKey(deviceId)
      : crypto.createHash('sha256').update(`${platform}|${userAgent}`).digest('hex').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    index += 1;
    await repo.upsertTrustedDevice({
      userId,
      deviceKey: key,
      deviceName: String(row.deviceName || 'Unknown Device'),
      platform,
      userAgent,
      source: String(row.source || 'mobile'),
      makePrimary: index === 1,
    });
  }
};

export const evaluateDeviceLogin = async (
  req: Request,
  userId: string,
): Promise<DeviceLoginDecision> => {
  const state = await getSubscriptionStateForUser(userId);
  const isPro = Boolean(state.entitlements.canUseMultiDevice);
  const maxTrustedDevices = isPro
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, state.limits.maxDevices || SUBSCRIPTION_CONFIG.freeLimits.maxDevices);

  await seedTrustedDevicesFromSessions(userId);

  const repo = getTrustedDeviceRepository();
  const deviceKey = resolveDeviceKey(req);
  const trustedDevices = await repo.listActiveByUserId(userId);
  const trustedDeviceCount = trustedDevices.length;
  const alreadyTrusted = trustedDevices.some((d) => d.deviceKey === deviceKey);

  const policy: DeviceLoginPolicy = {
    canRegisterNewDevice: isPro || trustedDeviceCount < maxTrustedDevices || alreadyTrusted,
    trustedDeviceCount,
    maxTrustedDevices: isPro ? trustedDeviceCount : maxTrustedDevices,
    isPro,
  };

  if (shouldRelaxDeviceLimits()) {
    return { allowed: true, policy, deviceKey };
  }

  if (isPro) {
    return { allowed: true, policy, deviceKey };
  }

  if (alreadyTrusted) {
    return { allowed: true, policy, deviceKey };
  }

  if (trustedDeviceCount < maxTrustedDevices) {
    return { allowed: true, policy, deviceKey };
  }

  return {
    allowed: false,
    code: 'NOVASAFE_DEVICE_LIMIT',
    message:
      'Free plan allows one trusted device. You can keep using devices already signed in, but this new device cannot be added. Upgrade to NovaSafe Pro to add more devices.',
    policy: {
      ...policy,
      canRegisterNewDevice: false,
    },
    subscription: state,
  };
};

export const registerTrustedDeviceForLogin = async (
  req: Request,
  userId: string,
  deviceKey: string,
): Promise<void> => {
  const device = resolveDeviceInfo(req);
  const ctx = getRequestContext();
  await getTrustedDeviceRepository().upsertTrustedDevice({
    userId,
    deviceKey,
    deviceName: device.deviceName,
    platform: device.platform,
    userAgent: device.userAgent,
    source: ctx?.legacySource ?? req.source ?? 'mobile',
    makePrimary: (await getTrustedDeviceRepository().countActiveByUserId(userId)) === 0,
  });
};

/** Attach device key to session row after login (best-effort). */
export const touchSessionDeviceId = async (tokenId: string, deviceKey: string): Promise<void> => {
  await getSessionRepository().updateActivityByTokenId(tokenId, { deviceId: deviceKey });
};
