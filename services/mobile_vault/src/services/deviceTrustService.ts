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

  const fingerprint = `${device.platform}|${device.userAgent}|${device.deviceName}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 40);
};

const sessionDeviceKey = (row: Record<string, unknown>): string => {
  const platform = String(row.platform || 'unknown');
  const userAgent = String(row.userAgent || '');
  const deviceId = row.deviceId ? String(row.deviceId) : '';
  if (deviceId) return sanitizeDeviceKey(deviceId);
  return crypto.createHash('sha256').update(`${platform}|${userAgent}`).digest('hex').slice(0, 40);
};

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

/**
 * Grandfather existing production users: seed from all historical sessions (active + revoked).
 */
export const seedTrustedDevicesFromSessions = async (userId: string): Promise<number> => {
  const existing = await countActiveTrustedDevices(userId);
  if (existing > 0) return existing;

  const sessions = await db.findMany(
    DB_CONFIG.collections.sessions,
    { userId: new ObjectId(userId) },
    { limit: 200, sort: { lastActivity: -1, createdAt: -1 } },
  );

  const seen = new Set<string>();
  let index = 0;
  const now = new Date();

  for (const row of sessions) {
    const key = sessionDeviceKey(row as Record<string, unknown>);
    if (seen.has(key)) continue;
    seen.add(key);
    index += 1;

    await db.getDb().collection(DEVICES()).updateOne(
      { userId: new ObjectId(userId), deviceKey: key },
      {
        $set: {
          deviceName: String((row as { deviceName?: string }).deviceName || 'Unknown Device'),
          platform: String((row as { platform?: string }).platform || 'unknown'),
          userAgent: String((row as { userAgent?: string }).userAgent || ''),
          source: String((row as { source?: string }).source || 'mobile'),
          trusted: true,
          isActive: true,
          lastSeenAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          userId: new ObjectId(userId),
          deviceKey: key,
          isPrimary: index === 1,
          createdAt: now,
        },
      },
      { upsert: true },
    );
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
  const alreadyTrusted = Boolean(await findTrustedByKey(userId, deviceKey));

  const policy: DeviceLoginPolicy = {
    canRegisterNewDevice: isPro || trustedDeviceCount < maxTrustedDevices || alreadyTrusted,
    trustedDeviceCount,
    maxTrustedDevices: isPro ? trustedDeviceCount : maxTrustedDevices,
    isPro,
  };

  if (shouldRelaxDeviceLimits()) {
    return { allowed: true, policy, deviceKey };
  }
  if (isPro || alreadyTrusted || trustedDeviceCount < maxTrustedDevices) {
    return { allowed: true, policy, deviceKey };
  }

  return {
    allowed: false,
    code: 'NOVASAFE_DEVICE_LIMIT',
    message:
      'Free plan allows one trusted device for new sign-ins. Devices you have used before can still sign in. Upgrade to NovaSafe Pro to add new devices.',
    policy: { ...policy, canRegisterNewDevice: false },
    subscription: state,
  };
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

  await db.getDb().collection(DEVICES()).updateOne(
    { userId: userObjectId, deviceKey },
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
        ...(activeCount === 0 ? { isPrimary: true } : {}),
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
};

export const touchSessionDeviceId = async (tokenId: string, deviceKey: string): Promise<void> => {
  await db.getDb().collection(DB_CONFIG.collections.sessions).updateOne(
    { tokenId },
    { $set: { deviceId: deviceKey, lastActivity: new Date() } },
  );
};
