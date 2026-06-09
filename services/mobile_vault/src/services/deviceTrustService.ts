import crypto from 'node:crypto';
import type { Request } from 'express';
import { ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';
import { SUBSCRIPTION_CONFIG } from '../config/subscriptionConfig';
import Database from '../database/connection';
import { getSubscriptionStateForUser } from './subscriptionService';
import type { SubscriptionState } from '../subscription/types';

const db = new Database(DB_CONFIG.databaseName);
const DEVICES = () => DB_CONFIG.collections.devices;

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

export const resolveDeviceKey = (req: Request, device: { platform: string; userAgent: string; deviceName: string }): string => {
  const fromHeader = req.headers['x-device-id'];
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

  return fullDeviceFingerprint(device.platform, device.userAgent, device.deviceName);
};

/** All keys that may represent the same physical device across app versions. */
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
): string[] => [...new Set([
  deviceKey,
  legacySessionFingerprint(device.platform, device.userAgent),
  fullDeviceFingerprint(device.platform, device.userAgent, device.deviceName),
])];

const countActiveTrustedDevices = async (userId: string): Promise<number> =>
  db.getDb().collection(DEVICES()).countDocuments({
    userId: new ObjectId(userId),
    isActive: true,
    trusted: true,
  });

const findTrustedByKey = async (userId: string, deviceKey: string) =>
  db.getDb().collection(DEVICES()).findOne({
    userId: new ObjectId(userId),
    deviceKey,
    isActive: true,
    trusted: true,
  });

const upsertTrustedDevice = async (
  userId: string,
  deviceKey: string,
  row: Record<string, unknown>,
  isPrimary: boolean,
): Promise<void> => {
  const now = new Date();
  await db.getDb().collection(DEVICES()).updateOne(
    { userId: new ObjectId(userId), deviceKey },
    {
      $set: {
        deviceName: String(row.deviceName || 'Unknown Device'),
        platform: String(row.platform || 'unknown'),
        userAgent: String(row.userAgent || ''),
        source: String(row.source || 'mobile'),
        trusted: true,
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: new ObjectId(userId),
        deviceKey,
        isPrimary,
        createdAt: now,
      },
    },
    { upsert: true },
  );
};

/** True if this login matches a trusted row or any historical session for same platform + UA. */
const isLoginDeviceTrusted = async (
  userId: string,
  deviceKey: string,
  device: { platform: string; userAgent: string; deviceName: string },
): Promise<boolean> => {
  for (const key of loginDeviceKeys(deviceKey, device)) {
    if (await findTrustedByKey(userId, key)) return true;
  }

  const session = await db.findOne(DB_CONFIG.collections.sessions, {
    userId: new ObjectId(userId),
    platform: device.platform,
    userAgent: device.userAgent,
  });
  return Boolean(session);
};

/**
 * Grandfather existing production users: seed from all historical sessions (active + revoked).
 * Always merges — does not skip when devices already exist (fixes partial migrations).
 */
export const seedTrustedDevicesFromSessions = async (userId: string): Promise<number> => {
  const sessions = await db.findMany(
    DB_CONFIG.collections.sessions,
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
      await upsertTrustedDevice(userId, key, record, index === 1);
    }
  }

  return countActiveTrustedDevices(userId);
};

export const evaluateDeviceLogin = async (
  req: Request,
  userId: string,
  device: { deviceName: string; platform: string; userAgent: string },
): Promise<DeviceLoginDecision> => {
  const state = await getSubscriptionStateForUser(userId);
  const isPro = Boolean(state.entitlements?.canUseMultiDevice);
  const maxTrustedDevices = isPro
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, state.limits?.maxDevices || SUBSCRIPTION_CONFIG.freeLimits.maxDevices);

  await seedTrustedDevicesFromSessions(userId);

  const deviceKey = resolveDeviceKey(req, device);
  const trustedDeviceCount = await countActiveTrustedDevices(userId);

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
  device: { deviceName: string; platform: string; userAgent: string },
): Promise<void> => {
  const now = new Date();
  const userObjectId = new ObjectId(userId);
  const activeCount = await countActiveTrustedDevices(userId);

  const filter = { userId: userObjectId, deviceKey };
  await db.getDb().collection(DEVICES()).updateOne(
    filter,
    {
      $set: {
        deviceName: device.deviceName,
        platform: device.platform,
        userAgent: device.userAgent,
        source: req.source || 'mobile',
        trusted: true,
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: userObjectId,
        deviceKey,
        isPrimary: activeCount === 0,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  if (activeCount === 0) {
    await db.getDb().collection(DEVICES()).updateOne(filter, { $set: { isPrimary: true } });
  }
};

export const touchSessionDeviceId = async (tokenId: string, deviceKey: string): Promise<void> => {
  await db.getDb().collection(DB_CONFIG.collections.sessions).updateOne(
    { tokenId },
    { $set: { deviceId: deviceKey, lastActivity: new Date() } },
  );
};
