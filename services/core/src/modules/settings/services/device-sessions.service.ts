import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { getTrustedDeviceRepository } from '../../auth/repositories/trusted-device.repository';
import { getSubscriptionStateForUser } from '../../subscriptions/services/subscription.service';
import { logger } from '../../../shared/logger';
import { isValidFcmToken, sendFcmToTokens } from './fcm.service';

const db = getNativeMongo();

const requireUserObjectId = (userId: string): ObjectId | null => {
  if (!userId || !ObjectId.isValid(userId)) return null;
  return new ObjectId(userId);
};

/** Push cleanup must never throw into auth / session flows. */
async function clearInvalidPushTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  try {
    const repo = getTrustedDeviceRepository();
    await Promise.all(tokens.map((t) => repo.clearPushToken(t)));
  } catch (error) {
    logger.warn('Failed clearing invalid FCM tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Best-effort push — failures are logged and swallowed. */
async function notifyDevices(
  userId: string,
  excludeDeviceKey: string | null | undefined,
  payload: {
    title: string;
    body: string;
    data: Record<string, string>;
  },
): Promise<void> {
  try {
    const targets = await getTrustedDeviceRepository().listPushTargets(userId, {
      excludeDeviceKey: excludeDeviceKey || null,
    });
    if (!targets.length) return;
    const result = await sendFcmToTokens(
      targets.map((t) => t.pushToken),
      payload,
    );
    await clearInvalidPushTokens(result.invalidTokens);
  } catch (error) {
    logger.warn('Device push notify failed', {
      userId,
      type: payload.data?.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendSessionEndedPush(
  tokens: string[],
  payload: {
    title: string;
    body: string;
    data: Record<string, string>;
  },
): Promise<void> {
  if (!tokens.length) return;
  try {
    const result = await sendFcmToTokens(tokens, payload);
    await clearInvalidPushTokens(result.invalidTokens);
  } catch (error) {
    logger.warn('Session-ended push failed', {
      type: payload.data?.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type DeviceSessionDto = {
  id: string;
  deviceKey?: string | null;
  tokenId?: string | null;
  isCurrent: boolean;
  status: 'active' | 'logged_out';
  deviceName: string;
  platform: string;
  osVersion?: string | null;
  appVersion?: string | null;
  ipAddress?: string | null;
  locationLabel?: string | null;
  country?: string | null;
  firstLoginAt?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string | null;
};

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as string | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export async function listDeviceSessions(input: {
  userId: string;
  currentTokenId?: string | null;
  currentDeviceId?: string | null;
}): Promise<{
  current: DeviceSessionDto | null;
  others: DeviceSessionDto[];
  singleDeviceLoginEnabled: boolean;
  isPro: boolean;
}> {
  const userObjectId = requireUserObjectId(input.userId);
  if (!userObjectId) {
    return { current: null, others: [], singleDeviceLoginEnabled: false, isPro: false };
  }
  const user = await db.findOne(COLLECTIONS.vaultUsers, { _id: userObjectId });
  const state = await getSubscriptionStateForUser(input.userId);
  const isPro = Boolean(state.entitlements?.canUseMultiDevice);

  const sessions = await db.findMany(
    COLLECTIONS.sessions,
    { userId: userObjectId },
    { sort: { lastActivity: -1, createdAt: -1 }, limit: 50 },
  );

  const mapped: DeviceSessionDto[] = sessions.map((s: Record<string, unknown>) => {
    const revoked = Boolean(s.revoked);
    const id = (s._id as { toString(): string })?.toString?.() || String(s.tokenId || '');
    const isCurrent = Boolean(
      (input.currentTokenId && s.tokenId === input.currentTokenId) ||
        (input.currentDeviceId && s.deviceId && String(s.deviceId) === input.currentDeviceId && !revoked),
    );
    return {
      id,
      deviceKey: s.deviceId ? String(s.deviceId) : null,
      tokenId: s.tokenId ? String(s.tokenId) : null,
      isCurrent,
      status: revoked ? 'logged_out' : 'active',
      deviceName: String(s.deviceName || 'Unknown device'),
      platform: String(s.platform || 'unknown'),
      osVersion: s.osVersion ? String(s.osVersion) : null,
      appVersion: s.appVersion ? String(s.appVersion) : null,
      ipAddress: s.ipAddress ? String(s.ipAddress) : null,
      locationLabel: s.locationLabel ? String(s.locationLabel) : null,
      country: s.lastGeoCountry ? String(s.lastGeoCountry) : null,
      firstLoginAt: toIso(s.createdAt),
      lastActiveAt: toIso(s.lastActivity || s.createdAt),
      createdAt: toIso(s.createdAt),
    };
  });

  // Prefer active current; fall back to first current match.
  const current =
    mapped.find((s) => s.isCurrent && s.status === 'active') ||
    mapped.find((s) => s.isCurrent) ||
    null;
  const others = mapped.filter((s) => !current || s.id !== current.id);

  return {
    current,
    others,
    singleDeviceLoginEnabled: Boolean(user?.singleDeviceLoginEnabled),
    isPro,
  };
}

export async function setSingleDeviceLogin(userId: string, enabled: boolean): Promise<boolean> {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return enabled;
  await db.updateOne(
    COLLECTIONS.vaultUsers,
    { _id: userObjectId },
    { $set: { singleDeviceLoginEnabled: enabled, updatedAt: new Date(), source: 'mobile' } },
  );
  return enabled;
}

export async function removeDeviceSession(input: {
  userId: string;
  sessionId: string;
  currentTokenId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (!ObjectId.isValid(input.sessionId)) {
    return { ok: false, message: 'Invalid session id' };
  }
  const userObjectId = requireUserObjectId(input.userId);
  if (!userObjectId) return { ok: false, message: 'Invalid user' };
  const session = await db.findOne(COLLECTIONS.sessions, {
    _id: new ObjectId(input.sessionId),
    userId: userObjectId,
  });
  if (!session) return { ok: false, message: 'Session not found' };
  if (input.currentTokenId && session.tokenId === input.currentTokenId) {
    return { ok: false, message: 'Cannot remove the current device from here' };
  }

  await db.updateOne(
    COLLECTIONS.sessions,
    { _id: new ObjectId(input.sessionId), userId: userObjectId },
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );

  const endedDeviceKey = session.deviceId ? String(session.deviceId) : null;
  let endedTokens: string[] = [];
  try {
    if (endedDeviceKey) {
      const pushTargets = await getTrustedDeviceRepository().listPushTargets(input.userId);
      endedTokens = pushTargets
        .filter((t) => t.deviceKey === endedDeviceKey)
        .map((t) => t.pushToken);
    }
  } catch (error) {
    logger.warn('Failed loading push targets for device removal', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (session.deviceId) {
    await getTrustedDeviceRepository().deactivateDevice(input.userId, String(session.deviceId));
  }

  await sendSessionEndedPush(endedTokens, {
    title: 'Signed out',
    body: 'This device was removed from your NovaSafe account.',
    data: {
      type: 'session_ended',
      reason: 'device_removed',
      deepLink: '/vault/settings/devices',
    },
  });

  return { ok: true, message: 'Device removed' };
}

export async function revokeOtherActiveSessions(
  userId: string,
  keepDeviceKey: string,
): Promise<number> {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId || !keepDeviceKey?.trim()) return 0;

  let endedTokens: string[] = [];
  try {
    const endedTargets = await getTrustedDeviceRepository().listPushTargets(userId, {
      excludeDeviceKey: keepDeviceKey,
    });
    endedTokens = endedTargets.map((t) => t.pushToken);
  } catch (error) {
    logger.warn('Failed loading push targets before session revoke', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const result = await db.getDb().collection(COLLECTIONS.sessions).updateMany(
    {
      userId: userObjectId,
      revoked: { $ne: true },
      deviceId: { $ne: keepDeviceKey },
    },
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );

  const repo = getTrustedDeviceRepository();
  const devices = await repo.listActiveByUserId(userId);
  for (const d of devices) {
    if (d.deviceKey !== keepDeviceKey) {
      await repo.deactivateDevice(userId, d.deviceKey);
    }
  }

  await sendSessionEndedPush(endedTokens, {
    title: 'Session ended',
    body: 'You were signed out because another device took over this account.',
    data: {
      type: 'session_ended',
      reason: 'replaced_by_other_device',
      deepLink: '/auth/sign-in',
    },
  });

  return result.modifiedCount || 0;
}

/** Persist a login-alert event and push to other registered devices. */
export async function recordDeviceLoginAlert(input: {
  userId: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
  locationLabel?: string | null;
  ipAddress?: string | null;
  kind: 'new_login' | 'single_device_conflict';
}): Promise<void> {
  const userObjectId = requireUserObjectId(input.userId);
  if (!userObjectId || !input.deviceKey?.trim()) {
    logger.warn('Skipped device login alert — invalid userId or deviceKey');
    return;
  }

  const insert = await db.getDb().collection(COLLECTIONS.deviceLoginAlerts).insertOne({
    userId: userObjectId,
    deviceKey: input.deviceKey,
    deviceName: input.deviceName || 'Unknown device',
    platform: input.platform || 'unknown',
    locationLabel: input.locationLabel || null,
    ipAddress: input.ipAddress || null,
    kind: input.kind,
    status: 'pending',
    createdAt: new Date(),
  });

  const alertId = insert.insertedId.toString();
  const locationBit = input.locationLabel ? ` · ${input.locationLabel}` : '';
  // Push is best-effort — must not fail login / auth response paths.
  await notifyDevices(input.userId, input.deviceKey, {
    title: 'New device login',
    body: `${input.deviceName || 'Unknown device'} (${input.platform || 'unknown'})${locationBit}. Was this you?`,
    data: {
      type: 'new_device_login',
      kind: input.kind,
      alertId,
      deviceKey: input.deviceKey,
      deviceName: String(input.deviceName || 'Unknown device'),
      platform: String(input.platform || 'unknown'),
      locationLabel: input.locationLabel || '',
      deepLink: '/vault/settings/devices',
    },
  });
}

export async function registerDevicePushToken(input: {
  userId: string;
  deviceKey: string;
  token: string;
  platform?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (!requireUserObjectId(input.userId)) {
    return { ok: false, message: 'Invalid user' };
  }
  if (!input.deviceKey?.trim()) {
    return { ok: false, message: 'deviceId is required' };
  }
  if (!isValidFcmToken(input.token)) {
    return { ok: false, message: 'Invalid FCM token' };
  }

  const deviceKey = input.deviceKey.trim().slice(0, 128);
  const token = input.token.trim();
  const platform =
    typeof input.platform === 'string' && input.platform.trim()
      ? input.platform.trim().slice(0, 64)
      : undefined;

  const repo = getTrustedDeviceRepository();
  let updated = await repo.updatePushToken(input.userId, deviceKey, token);
  if (!updated) {
    // Device may not be trusted yet (first login race) — upsert a stub then set token.
    await repo.upsertTrustedDevice({
      userId: input.userId,
      deviceKey,
      platform,
      source: 'mobile',
    });
    updated = await repo.updatePushToken(input.userId, deviceKey, token);
  }

  // One token → one device: clear duplicates on other rows.
  await db.getDb().collection(COLLECTIONS.devices).updateMany(
    {
      userId: new ObjectId(input.userId),
      deviceKey: { $ne: deviceKey },
      pushToken: token,
    },
    { $set: { pushToken: null } },
  );

  return updated
    ? { ok: true, message: 'Push token registered' }
    : { ok: false, message: 'Failed to store push token' };
}

export async function listPendingLoginAlerts(userId: string) {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return [];
  return db.findMany(
    COLLECTIONS.deviceLoginAlerts,
    { userId: userObjectId, status: 'pending' },
    { sort: { createdAt: -1 }, limit: 20 },
  );
}

export async function resolveLoginAlert(
  userId: string,
  alertId: string,
  action: 'its_me' | 'not_me',
): Promise<{ ok: boolean; message: string }> {
  if (!ObjectId.isValid(alertId)) return { ok: false, message: 'Invalid alert id' };
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return { ok: false, message: 'Invalid user' };
  const alert = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
    _id: new ObjectId(alertId),
    userId: userObjectId,
  });
  if (!alert) return { ok: false, message: 'Alert not found' };

  await db.updateOne(
    COLLECTIONS.deviceLoginAlerts,
    { _id: new ObjectId(alertId) },
    { $set: { status: action === 'its_me' ? 'confirmed' : 'rejected', resolvedAt: new Date() } },
  );

  if (action === 'not_me') {
    let endedTokens: string[] = [];
    try {
      endedTokens = (await getTrustedDeviceRepository().listPushTargets(userId)).map(
        (t) => t.pushToken,
      );
    } catch (error) {
      logger.warn('Failed loading push targets for login reject', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await db.getDb().collection(COLLECTIONS.sessions).updateMany(
      { userId: userObjectId, revoked: { $ne: true } },
      { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
    );
    const devices = await getTrustedDeviceRepository().listActiveByUserId(userId);
    for (const d of devices) {
      await getTrustedDeviceRepository().deactivateDevice(userId, d.deviceKey);
    }
    await sendSessionEndedPush(endedTokens, {
      title: 'Session ended',
      body: 'A suspicious sign-in was rejected. All devices were signed out.',
      data: {
        type: 'session_ended',
        reason: 'login_rejected',
        deepLink: '/auth/sign-in',
      },
    });
    return { ok: true, message: 'Sign-in rejected. All sessions were signed out.' };
  }

  return { ok: true, message: 'Login confirmed' };
}
