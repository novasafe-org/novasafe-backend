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

export type DeviceLoginConflict = {
  deviceName: string;
  platform: string;
  locationLabel?: string | null;
  time?: string | null;
  sessionId?: string | null;
};

export type DeviceLoginDecision =
  | { allowed: true; policy: DeviceLoginPolicy; deviceKey: string }
  | {
      allowed: false;
      code: 'NOVASAFE_DEVICE_LIMIT' | 'NOVASAFE_SINGLE_DEVICE_LOGIN';
      message: string;
      policy: DeviceLoginPolicy;
      subscription: SubscriptionState;
      conflict?: DeviceLoginConflict;
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
  hardwareFingerprint?: string | null,
): Promise<boolean> => {
  // Consent flow: only the trusted-device registry counts (not historical sessions).
  const repo = getTrustedDeviceRepository();
  for (const key of loginDeviceKeys(deviceKey, device)) {
    const row = await repo.findByUserAndKey(userId, key);
    if (row?.trusted && !row.compromisedAt) return true;
  }
  // Reinstall: same phone, new install UUID — match stable hardware fingerprint.
  if (hardwareFingerprint) {
    const byHw = await repo.findByUserAndHardwareFingerprint(userId, hardwareFingerprint);
    if (byHw?.trusted && !byHw.compromisedAt) return true;
  }
  return false;
};

/**
 * Bootstrap trusted devices from **active** sessions only when the user has
 * none yet. Revoked / historical sessions must not be seeded — that creates
 * phantom trusted keys nobody can sign in as, so new devices wait forever
 * for an It’s me that can never arrive.
 */
export const seedTrustedDevicesFromSessions = async (userId: string): Promise<void> => {
  const repo = getTrustedDeviceRepository();
  if ((await repo.countActiveByUserId(userId)) > 0) return;

  const db = getNativeMongo();
  const sessions = await db.findMany(
    COLLECTIONS.sessions,
    { userId: new ObjectId(userId), revoked: { $ne: true } },
    { limit: 50, sort: { lastActivity: -1, createdAt: -1 } },
  );

  const seen = new Set<string>();
  let index = 0;

  for (const row of sessions) {
    const record = row as Record<string, unknown>;
    // Prefer real install UUID only — UA fingerprints create unusable trust rows.
    const deviceId = record.deviceId ? sanitizeDeviceKey(String(record.deviceId)) : '';
    if (!deviceId || seen.has(deviceId)) continue;
    seen.add(deviceId);
    index += 1;
    await repo.upsertTrustedDevice({
      userId,
      deviceKey: deviceId,
      deviceName: String(record.deviceName || 'Unknown Device'),
      platform: String(record.platform || 'unknown'),
      userAgent: String(record.userAgent || ''),
      source: String(record.source || 'mobile'),
      makePrimary: index === 1,
      trusted: true,
    });
  }
};

/**
 * True when another trusted device still has a live session and can approve.
 * Phantom / seeded / logged-out trusted rows do not count.
 */
export const hasLiveApproverDevice = async (
  userId: string,
  excludeDeviceKey: string,
): Promise<boolean> => {
  const repo = getTrustedDeviceRepository();
  const trusted = await repo.listActiveByUserId(userId);
  const others = trusted.filter(
    (d) => String(d.deviceKey) !== excludeDeviceKey && !d.compromisedAt,
  );
  if (!others.length) return false;

  const db = getNativeMongo();
  for (const row of others) {
    const session = await db.findOne(COLLECTIONS.sessions, {
      userId: new ObjectId(userId),
      deviceId: String(row.deviceKey),
      revoked: { $ne: true },
    });
    if (session) return true;
  }
  return false;
};

export type PendingDeviceConsent = {
  alertId: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
  status: 'pending';
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
  const { resolveHardwareFingerprint } = await import('./device-silent-resume.service');
  const hardwareFingerprint = resolveHardwareFingerprint(req);
  const repo = getTrustedDeviceRepository();
  const trustedDeviceCount = await repo.countActiveByUserId(userId);
  const alreadyTrusted = await isLoginDeviceTrusted(
    userId,
    deviceKey,
    device,
    hardwareFingerprint,
  );

  const forceReplace = Boolean(
    req.body?.forceReplaceSessions === true || req.body?.forceReplaceSessions === 'true',
  );

  const policy: DeviceLoginPolicy = {
    canRegisterNewDevice: isPro || trustedDeviceCount < maxTrustedDevices || alreadyTrusted,
    trustedDeviceCount,
    maxTrustedDevices: isPro ? Number.MAX_SAFE_INTEGER : maxTrustedDevices,
    isPro,
  };

  if (shouldRelaxDeviceLimits()) {
    return { allowed: true, policy, deviceKey };
  }

  if (forceReplace) {
    const { revokeOtherActiveSessions } = await import(
      '../../settings/services/device-sessions.service'
    );
    await revokeOtherActiveSessions(userId, deviceKey);
    return { allowed: true, policy, deviceKey };
  }

  const db = getNativeMongo();
  const user = await db.findOne(COLLECTIONS.vaultUsers, { _id: new ObjectId(userId) });
  const singleDeviceLoginEnabled = Boolean(user?.singleDeviceLoginEnabled);

  const otherActive = await db.findOne(COLLECTIONS.sessions, {
    userId: new ObjectId(userId),
    revoked: { $ne: true },
    deviceId: { $ne: deviceKey },
  });

  // Pro single-device login: another active session on a different device.
  if (isPro && singleDeviceLoginEnabled && otherActive && !alreadyTrusted) {
    return {
      allowed: false,
      code: 'NOVASAFE_SINGLE_DEVICE_LOGIN',
      message:
        'Single-device login is enabled. End the session on your other device, or continue to sign out there.',
      policy: { ...policy, canRegisterNewDevice: false },
      subscription: state,
      conflict: {
        deviceName: String(otherActive.deviceName || 'Other device'),
        platform: String(otherActive.platform || 'unknown'),
        locationLabel: otherActive.locationLabel ? String(otherActive.locationLabel) : null,
        time: otherActive.lastActivity
          ? new Date(otherActive.lastActivity as Date).toISOString()
          : new Date().toISOString(),
        sessionId: otherActive._id?.toString?.() || null,
      },
    };
  }

  // Free plan: only one trusted device unless this device is already known.
  if (!isPro && !alreadyTrusted && trustedDeviceCount >= maxTrustedDevices) {
    const conflictSession =
      otherActive ||
      (await db.findOne(COLLECTIONS.sessions, {
        userId: new ObjectId(userId),
        revoked: { $ne: true },
      }));
    return {
      allowed: false,
      code: 'NOVASAFE_DEVICE_LIMIT',
      message:
        'Free accounts can stay signed in on one device. Continue to switch to this device, or upgrade to Pro.',
      policy: { ...policy, canRegisterNewDevice: false },
      subscription: state,
      conflict: conflictSession
        ? {
            deviceName: String(conflictSession.deviceName || 'Other device'),
            platform: String(conflictSession.platform || 'unknown'),
            locationLabel: conflictSession.locationLabel
              ? String(conflictSession.locationLabel)
              : null,
            time: conflictSession.lastActivity
              ? new Date(conflictSession.lastActivity as Date).toISOString()
              : new Date().toISOString(),
            sessionId: conflictSession._id?.toString?.() || null,
          }
        : undefined,
    };
  }

  return { allowed: true, policy, deviceKey };
};

export const registerTrustedDeviceForLogin = async (
  req: Request,
  userId: string,
  deviceKey: string,
): Promise<PendingDeviceConsent | null> => {
  const device = resolveDeviceInfo(req);
  const ctx = getRequestContext();
  const repo = getTrustedDeviceRepository();
  const { resolveHardwareFingerprint } = await import('./device-silent-resume.service');
  const hardwareFingerprint = resolveHardwareFingerprint(req);
  const alreadyTrusted = await isLoginDeviceTrusted(
    userId,
    deviceKey,
    device,
    hardwareFingerprint,
  );
  const trustedCount = await repo.countActiveByUserId(userId);
  const forceReplace = Boolean(
    req.body?.forceReplaceSessions === true || req.body?.forceReplaceSessions === 'true',
  );
  const source = ctx?.legacySource ?? req.source ?? 'mobile';

  // Nobody online who can approve → trust immediately (avoids stuck allow-login).
  const canBeApproved =
    trustedCount > 0 && !alreadyTrusted && !forceReplace
      ? await hasLiveApproverDevice(userId, deviceKey)
      : false;

  // First trusted slot, already trusted, replace, or no live approver → trust now.
  if (alreadyTrusted || forceReplace || trustedCount === 0 || !canBeApproved) {
    // If trusted via fingerprint after reinstall, rebind old key → current install UUID.
    if (alreadyTrusted && hardwareFingerprint) {
      const byHw = await repo.findByUserAndHardwareFingerprint(userId, hardwareFingerprint);
      if (byHw && String(byHw.deviceKey) !== deviceKey) {
        await repo.rebindDeviceKey({
          userId,
          fromDeviceKey: String(byHw.deviceKey),
          toDeviceKey: deviceKey,
          hardwareFingerprint,
        });
      }
    }
    await repo.upsertTrustedDevice({
      userId,
      deviceKey,
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
      source,
      makePrimary: trustedCount === 0 || forceReplace || !canBeApproved,
      trusted: true,
      hardwareFingerprint,
    });
    return null;
  }

  // Untrusted device B: keep pending until a trusted device confirms.
  await repo.upsertTrustedDevice({
    userId,
    deviceKey,
    deviceName: device.deviceName,
    platform: device.platform,
    userAgent: device.userAgent,
    source,
    makePrimary: false,
    trusted: false,
    hardwareFingerprint,
  });

  const { ensurePendingLoginAlert } = await import(
    '../../settings/services/device-sessions.service'
  );
  const ipAddress = String(
    req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
  )
    .split(',')[0]
    .trim();
  const alertId = await ensurePendingLoginAlert({
    userId,
    deviceKey,
    deviceName: device.deviceName,
    platform: device.platform,
    locationLabel: null,
    ipAddress: ipAddress || null,
    kind: 'new_login',
  });

  return {
    alertId,
    deviceKey,
    deviceName: device.deviceName,
    platform: device.platform,
    status: 'pending',
  };
};

/** Attach device key to session row after login (best-effort). */
export const touchSessionDeviceId = async (tokenId: string, deviceKey: string): Promise<void> => {
  const db = getNativeMongo();
  await db.getDb().collection(COLLECTIONS.sessions).updateOne(
    { tokenId },
    { $set: { deviceId: deviceKey, lastActivity: new Date() } },
  );
};
