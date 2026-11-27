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
    if (!targets.length) {
      logger.warn('Device push skipped — no trusted FCM targets', {
        userId,
        type: payload.data?.type,
        excludeDeviceKey: excludeDeviceKey || null,
      });
      return;
    }
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

  // Soft-deleted / revoked sessions must not appear on manage-devices UI.
  const sessions = await db.findMany(
    COLLECTIONS.sessions,
    {
      userId: userObjectId,
      revoked: { $ne: true },
      deleted: { $ne: true },
    },
    { sort: { lastActivity: -1, createdAt: -1 }, limit: 50 },
  );

  const mapped: DeviceSessionDto[] = sessions
    .filter((s: Record<string, unknown>) => !Boolean(s.revoked) && !Boolean(s.deleted))
    .map((s: Record<string, unknown>) => {
      const id = (s._id as { toString(): string })?.toString?.() || String(s.tokenId || '');
      const isCurrent = Boolean(
        (input.currentTokenId && s.tokenId === input.currentTokenId) ||
          (input.currentDeviceId &&
            s.deviceId &&
            String(s.deviceId) === input.currentDeviceId),
      );
      return {
        id,
        deviceKey: s.deviceId ? String(s.deviceId) : null,
        tokenId: s.tokenId ? String(s.tokenId) : null,
        isCurrent,
        status: 'active' as const,
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

  const current = mapped.find((s) => s.isCurrent) || null;
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

/**
 * Revoke every active session for the account except the caller's current session.
 * Does not remove trusted-device registry rows.
 */
export async function revokeAllSessionsExceptCurrent(
  userId: string,
  currentTokenId: string,
): Promise<{ revokedCount: number }> {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId || !currentTokenId?.trim()) {
    return { revokedCount: 0 };
  }

  let endedTokens: string[] = [];
  try {
    const current = await db.findOne(COLLECTIONS.sessions, {
      userId: userObjectId,
      tokenId: currentTokenId,
    });
    const keepDeviceKey = current?.deviceId ? String(current.deviceId) : null;
    const targets = await getTrustedDeviceRepository().listPushTargets(userId, {
      excludeDeviceKey: keepDeviceKey,
    });
    endedTokens = targets.map((t) => t.pushToken);
  } catch (error) {
    logger.warn('Failed loading push targets before revoke-all-sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const result = await db.getDb().collection(COLLECTIONS.sessions).updateMany(
    {
      userId: userObjectId,
      revoked: { $ne: true },
      tokenId: { $ne: currentTokenId },
    },
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );

  await sendSessionEndedPush(endedTokens, {
    title: 'Session ended',
    body: 'You were signed out from this device.',
    data: {
      type: 'session_ended',
      reason: 'sessions_revoked',
      deepLink: '/auth/sign-in',
    },
  });

  return { revokedCount: result.modifiedCount || 0 };
}

/**
 * Remove every device for the account except the current one.
 * Deactivates trusted-device rows and revokes sessions on those devices.
 */
export async function removeAllDevicesExceptCurrent(
  userId: string,
  keepDeviceKey: string,
  currentTokenId?: string | null,
): Promise<{ removedDevices: number; revokedSessions: number }> {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId || !keepDeviceKey?.trim()) {
    return { removedDevices: 0, revokedSessions: 0 };
  }

  let endedTokens: string[] = [];
  try {
    const targets = await getTrustedDeviceRepository().listPushTargets(userId, {
      excludeDeviceKey: keepDeviceKey,
    });
    endedTokens = targets.map((t) => t.pushToken);
  } catch (error) {
    logger.warn('Failed loading push targets before remove-all-devices', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const removedDevices = await getTrustedDeviceRepository().deactivateAllExcept(
    userId,
    keepDeviceKey,
  );

  const sessionFilter: Record<string, unknown> = {
    userId: userObjectId,
    revoked: { $ne: true },
    deviceId: { $ne: keepDeviceKey },
  };
  if (currentTokenId) {
    sessionFilter.tokenId = { $ne: currentTokenId };
  }

  const revokeResult = await db.getDb().collection(COLLECTIONS.sessions).updateMany(
    sessionFilter,
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );

  await sendSessionEndedPush(endedTokens, {
    title: 'Device removed',
    body: 'This device was removed from your NovaSafe account.',
    data: {
      type: 'session_ended',
      reason: 'device_removed',
      deepLink: '/auth/sign-in',
    },
  });

  return {
    removedDevices,
    revokedSessions: revokeResult.modifiedCount || 0,
  };
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

const NEW_LOGIN_DEEP_LINK = '/vault/settings/devices/new-login';

/** Persist a login-alert event and push to other registered (trusted) devices. */
export async function recordDeviceLoginAlert(input: {
  userId: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
  locationLabel?: string | null;
  ipAddress?: string | null;
  kind: 'new_login' | 'single_device_conflict';
}): Promise<string | null> {
  const userObjectId = requireUserObjectId(input.userId);
  if (!userObjectId || !input.deviceKey?.trim()) {
    logger.warn('Skipped device login alert — invalid userId or deviceKey');
    return null;
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
      deepLink: NEW_LOGIN_DEEP_LINK,
    },
  });
  return alertId;
}

/**
 * Reuse an existing pending alert for this device, or create + push a new one.
 * Used when untrusted device B re-authenticates while waiting for consent.
 */
export async function ensurePendingLoginAlert(input: {
  userId: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
  locationLabel?: string | null;
  ipAddress?: string | null;
  kind: 'new_login' | 'single_device_conflict';
}): Promise<string> {
  const userObjectId = requireUserObjectId(input.userId);
  if (!userObjectId) return '';

  const existing = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
    userId: userObjectId,
    deviceKey: input.deviceKey,
    status: 'pending',
  });
  if (existing?._id) {
    const alertId = existing._id.toString();
    // Re-notify trusted devices (best-effort) so they see the pending login again.
    const locationBit = input.locationLabel ? ` · ${input.locationLabel}` : '';
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
        deepLink: NEW_LOGIN_DEEP_LINK,
      },
    });
    return alertId;
  }

  return (await recordDeviceLoginAlert(input)) || '';
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
    // Device row may be missing — upsert a stub without auto-trusting (consent flow).
    const existing = await repo.findByUserAndKey(input.userId, deviceKey);
    await repo.upsertTrustedDevice({
      userId: input.userId,
      deviceKey,
      platform,
      source: 'mobile',
      trusted: existing?.trusted === true,
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

/**
 * Pending alerts for **trusted** devices only. Untrusted device B never sees
 * It’s me / Not me. Also excludes alerts for the caller's own deviceKey.
 */
export async function listPendingLoginAlerts(
  userId: string,
  options?: { excludeDeviceKey?: string | null; callerDeviceKey?: string | null },
) {
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return [];

  const callerKey = options?.callerDeviceKey || options?.excludeDeviceKey || null;
  // Without a device key we cannot prove the caller is trusted — return nothing.
  if (!callerKey) return [];
  const row = await getTrustedDeviceRepository().findByUserAndKey(userId, callerKey);
  if (!row?.trusted) return [];

  const filter: Record<string, unknown> = {
    userId: userObjectId,
    status: 'pending',
    deviceKey: { $ne: callerKey },
  };
  return db.findMany(COLLECTIONS.deviceLoginAlerts, filter, {
    sort: { createdAt: -1 },
    limit: 20,
  });
}

export async function getLoginAlertStatus(
  userId: string,
  alertId: string,
): Promise<{
  ok: boolean;
  message?: string;
  status?: string;
  deviceKey?: string;
  deviceName?: string;
  platform?: string;
}> {
  if (!ObjectId.isValid(alertId)) return { ok: false, message: 'Invalid alert id' };
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return { ok: false, message: 'Invalid user' };
  const alert = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
    _id: new ObjectId(alertId),
    userId: userObjectId,
  });
  if (!alert) return { ok: false, message: 'Alert not found' };
  return {
    ok: true,
    status: String(alert.status || 'pending'),
    deviceKey: alert.deviceKey ? String(alert.deviceKey) : undefined,
    deviceName: alert.deviceName ? String(alert.deviceName) : undefined,
    platform: alert.platform ? String(alert.platform) : undefined,
  };
}

export async function resolveLoginAlert(
  userId: string,
  alertId: string,
  action: 'its_me' | 'not_me',
  options?: { actorDeviceKey?: string | null },
): Promise<{ ok: boolean; message: string }> {
  if (!ObjectId.isValid(alertId)) return { ok: false, message: 'Invalid alert id' };
  const userObjectId = requireUserObjectId(userId);
  if (!userObjectId) return { ok: false, message: 'Invalid user' };
  const alert = await db.findOne(COLLECTIONS.deviceLoginAlerts, {
    _id: new ObjectId(alertId),
    userId: userObjectId,
  });
  if (!alert) return { ok: false, message: 'Alert not found' };
  if (String(alert.status) !== 'pending') {
    return { ok: false, message: 'Alert already resolved' };
  }

  const pendingDeviceKey = String(alert.deviceKey || '');
  const repo = getTrustedDeviceRepository();

  // Device B must not resolve its own login; actor must be trusted.
  if (options?.actorDeviceKey) {
    if (pendingDeviceKey && options.actorDeviceKey === pendingDeviceKey) {
      return { ok: false, message: 'Only a trusted device can allow or deny this login' };
    }
    const actor = await repo.findByUserAndKey(userId, options.actorDeviceKey);
    if (!actor?.trusted) {
      return { ok: false, message: 'Only a trusted device can allow or deny this login' };
    }
  }

  await db.updateOne(
    COLLECTIONS.deviceLoginAlerts,
    { _id: new ObjectId(alertId) },
    { $set: { status: action === 'its_me' ? 'confirmed' : 'rejected', resolvedAt: new Date() } },
  );

  if (action === 'its_me') {
    if (pendingDeviceKey) {
      await repo.markTrusted(userId, pendingDeviceKey);
    }
    // Notify device B so the waiting interstitial can proceed (poll is primary).
    const bToken = pendingDeviceKey
      ? await repo.findPushTokenForDevice(userId, pendingDeviceKey)
      : null;
    if (bToken) {
      await sendSessionEndedPush([bToken], {
        title: 'Login approved',
        body: 'A trusted device allowed this sign-in.',
        data: {
          type: 'login_approved',
          alertId,
          deviceKey: pendingDeviceKey,
          deepLink: '/vault',
        },
      });
    }
    return { ok: true, message: 'Login confirmed' };
  }

  // Not me: reject only device B — keep trusted devices signed in.
  // Order: alert already marked rejected above → mark B compromised (kills silent
  // resume) → notify B (FCM) → then revoke sessions so B's status poll can still
  // succeed briefly, and FCM can wake B.
  if (pendingDeviceKey) {
    try {
      const { markDeviceCompromised } = await import(
        '../../auth/services/device-silent-resume.service'
      );
      await markDeviceCompromised(userId, pendingDeviceKey, 'login_rejected_not_me');
    } catch (error) {
      logger.warn('Failed marking device compromised on Not-me', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let bToken: string | null = null;
  try {
    bToken = pendingDeviceKey
      ? await repo.findPushTokenForDevice(userId, pendingDeviceKey)
      : null;
  } catch (error) {
    logger.warn('Failed loading push token for login reject', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (bToken) {
    await sendSessionEndedPush([bToken], {
      title: 'Login not allowed',
      body: 'This is not a trusted device. The account owner denied this sign-in.',
      data: {
        type: 'session_ended',
        reason: 'login_rejected',
        alertId,
        deepLink: '/auth/sign-in',
      },
    });
  }

  if (pendingDeviceKey) {
    await db.getDb().collection(COLLECTIONS.sessions).updateMany(
      {
        userId: userObjectId,
        revoked: { $ne: true },
        $or: [{ deviceId: pendingDeviceKey }, { deviceKey: pendingDeviceKey }],
      },
      { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
    );
    await repo.deactivateDevice(userId, pendingDeviceKey);
  }

  return { ok: true, message: 'Sign-in rejected for the new device.' };
}
