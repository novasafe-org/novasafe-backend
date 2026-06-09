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

/** Matches keys seeded from historical sessions (no deviceName in hash). */
export const legacySessionFingerprint = (platform: string, userAgent: string): string =>
  crypto.createHash('sha256').update(`${platform}|${userAgent}`).digest('hex').slice(0, 40);

/** Fallback when no X-Device-Id header is sent. */
export const fullDeviceFingerprint = (
  platform: string,
  userAgent: string,
  deviceName: string,
): string =>
  crypto.createHash('sha256').update(`${platform}|${userAgent}|${deviceName}`).digest('hex').slice(0, 40);

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
  return fullDeviceFingerprint(device.platform, device.userAgent, device.deviceName);
};

const sessionDeviceKeys = (row: Record<string, unknown>): string[] => {
  const platform = String(row.platform || 'unknown');
  const userAgent = String(row.userAgent || '');
  const deviceName = String(row.deviceName || '');
  const keys = new Set<string>();
  const deviceId = row.deviceId ? String(row.deviceId) : '';
  if (deviceId) keys.add(sanitizeDeviceKey(deviceId));
  keys.add(legacySessionFingerprint(platform, userAgent));
  if (deviceName) keys.add(fullDeviceFingerprint(platform, userAgent, deviceName));
  return [...keys];
};

const loginDeviceKeys = (
  deviceKey: string,
  device: { platform: string; userAgent: string; deviceName: string },
): string[] => [
  ...new Set([
    deviceKey,
    legacySessionFingerprint(device.platform, device.userAgent),
    fullDeviceFingerprint(device.platform, device.userAgent, device.deviceName),
  ]),
];

const isLoginDeviceTrusted = async (
  userId: string,
  deviceKey: string,
  device: { platform: string; userAgent: string; deviceName: string },
): Promise<boolean> => {
  const repo = getTrustedDeviceRepository();
  for (const key of loginDeviceKeys(deviceKey, device)) {
    const row = await repo.findByUserAndKey(userId, key);
    if (row?.trusted) return true;
  }

  const db = getNativeMongo();
  const session = await db.findOne(COLLECTIONS.sessions, {
    userId: new ObjectId(userId),
    platform: device.platform,
    userAgent: device.userAgent,
  });
  return Boolean(session);
};

/**
 * Grandfather devices from all historical sessions (active + revoked).
 * Always merges — does not skip when devices already exist.
 */
export const seedTrustedDevicesFromSessions = async (userId: string): Promise<void> => {
  const db = getNativeMongo();
  const repo = getTrustedDeviceRepository();
  const sessions = await db.findMany(
    COLLECTIONS.sessions,
    { userId: new ObjectId(userId) },
    { limit: 200, sort: { lastActivity: -1, createdAt: -1 } },
  );

  const seen = new Set<string>();
  let index = 0;

  for (const row of sessions) {
    const record = row as Record<string, unknown>;
    for (const key of sessionDeviceKeys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      index += 1;
      await repo.upsertTrustedDevice({
        userId,
        deviceKey: key,
        deviceName: String(record.deviceName || 'Unknown Device'),
        platform: String(record.platform || 'unknown'),
        userAgent: String(record.userAgent || ''),
        source: String(record.source || 'mobile'),
        makePrimary: index === 1,
      });
    }
  }
};

export const evaluateDeviceLogin = async (
  req: Request,
  userId: string,
): Promise<DeviceLoginDecision> => {
  const state = await getSubscriptionStateForUser(userId);
  const isPro = Boolean(state.entitlements?.canUseMultiDevice);
  const maxTrustedDevices = isPro
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, state.limits?.maxDevices || SUBSCRIPTION_CONFIG.freeLimits.maxDevices);

  await seedTrustedDevicesFromSessions(userId);

  const device = resolveDeviceInfo(req);
  const deviceKey = resolveDeviceKey(req);
  const repo = getTrustedDeviceRepository();
  const trustedDeviceCount = await repo.countActiveByUserId(userId);

  const policy: DeviceLoginPolicy = {
    canRegisterNewDevice: true,
    trustedDeviceCount,
    maxTrustedDevices: isPro ? trustedDeviceCount : maxTrustedDevices,
    isPro,
  };

  // Device count is tracked for analytics/display only — login is never gated by plan tier.
  return { allowed: true, policy, deviceKey };
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
  const db = getNativeMongo();
  await db.getDb().collection(COLLECTIONS.sessions).updateOne(
    { tokenId },
    { $set: { deviceId: deviceKey, lastActivity: new Date() } },
  );
};
