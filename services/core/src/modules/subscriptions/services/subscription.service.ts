import { ObjectId } from "../../../database/object-id";
import { COLLECTIONS } from "../../../database/collections";
import type { EntitlementKey } from "../config/subscription.config";
import { SUBSCRIPTION_CONFIG } from "../config/subscription.config";
import { getNativeMongo } from "../../../database/adapters/native-mongo.adapter";
import { fetchRevenueCatOfferings } from './revenue-cat.service';
import { ensureSubscriptionIndexes } from "../revenuecat/subscriptionRepository";
import { refreshSubscriptionStateFromRevenueCat } from "../revenuecat/revenueCatSubscriberSync";
import { isWebhookSecretConfigured } from "../revenuecat/revenueCatWebhookAuth";
import {
  defaultSubscriptionState,
  hasEntitlement,
  isProFromState,
  withAppFreeOverride,
  withTierEntitlements,
} from "../revenuecat/subscriptionStateMapper";
import {
  findVaultUserById,
  getPersistedSubscriptionState,
  listPurchaseHistoryForUser,
  listSubscriptionEventsForUser,
} from "../revenuecat/subscriptionRepository";
import type { SubscriptionState } from "../revenuecat/types";

export type { SubscriptionState } from "../revenuecat/types";

const db = getNativeMongo();

export { ensureSubscriptionIndexes };
export { processRevenueCatWebhook } from "../revenuecat/revenueCatWebhookProcessor";

async function isUserAppFreeOverride(userId: string): Promise<boolean> {
  const user = await findVaultUserById(userId);
  return Boolean(user && (user as { appFreeOverride?: boolean }).appFreeOverride === true);
}

/**
 * Merge vaultUsers.appFreeOverride into a resolved subscription state (read-time only).
 * Ensures maxDocuments is always present for older persisted free/pro states.
 */
export async function applyAppFreeOverrideForUser(
  userId: string,
  state: SubscriptionState,
): Promise<SubscriptionState> {
  if (await isUserAppFreeOverride(userId)) {
    return withAppFreeOverride(state);
  }
  const limits = state.limits ?? {
    maxPasswords: SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
    maxSecureNotes: SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
    maxDevices: SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
    maxDocuments: SUBSCRIPTION_CONFIG.freeLimits.maxDocuments,
  };
  return {
    ...state,
    appFreeOverride: false,
    limits: {
      ...limits,
      maxDocuments:
        limits.maxDocuments ??
        (state.isPro
          ? Number.MAX_SAFE_INTEGER
          : SUBSCRIPTION_CONFIG.freeLimits.maxDocuments),
    },
  };
}

export async function getSubscriptionStateForUser(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<SubscriptionState> {
  const base = options?.forceRefresh
    ? await refreshSubscriptionStateFromRevenueCat(userId)
    : await getPersistedSubscriptionStateForUser(userId);
  return applyAppFreeOverrideForUser(userId, base);
}

export async function getPersistedSubscriptionStateForUser(userId: string): Promise<SubscriptionState> {
  const stored = await getPersistedSubscriptionState(userId);
  const current = stored ? { ...defaultSubscriptionState(), ...stored } : defaultSubscriptionState();
  const tier = isProFromState(current) ? "pro" : "free";
  return withTierEntitlements({ ...current, updatedAt: new Date().toISOString() }, tier);
}

export { hasEntitlement };

const entitlementDeniedMessage = (entitlement: EntitlementKey): string => {
  const messages: Record<EntitlementKey, string> = {
    canUseCloudSync: "Cloud sync requires NovaSafe Pro",
    canUseCSVImportExport: "CSV import/export requires NovaSafe Pro",
    canUseUnlimitedPasswords: "Unlimited passwords require NovaSafe Pro",
    canUseUnlimitedNotes: "Unlimited notes require NovaSafe Pro",
    canUsePasswordHistory: "Password history requires NovaSafe Pro",
    canUseAdvancedSecurity: "Advanced security analytics require NovaSafe Pro",
    canUseMultiDevice: "Multiple devices require NovaSafe Pro",
  };
  return messages[entitlement];
};

export async function assertEntitlement(
  userId: string,
  entitlement: EntitlementKey,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; state: SubscriptionState; message: string }> {
  const state = await getSubscriptionStateForUser(userId);
  if (hasEntitlement(state, entitlement)) return { ok: true, state };
  return { ok: false, state, message: entitlementDeniedMessage(entitlement) };
}

/**
 * Re-check entitlement after a live RevenueCat sync (e.g. user just purchased Pro in-app).
 */
export async function assertEntitlementWithRefresh(
  userId: string,
  entitlement: EntitlementKey,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; state: SubscriptionState; message: string }> {
  const first = await assertEntitlement(userId, entitlement);
  if (first.ok) return first;

  try {
    const refreshed = await refreshSubscriptionStateFromRevenueCat(userId);
    const state = await applyAppFreeOverrideForUser(userId, refreshed);
    if (hasEntitlement(state, entitlement)) {
      return { ok: true, state };
    }
    return { ok: false, state, message: entitlementDeniedMessage(entitlement) };
  } catch {
    return first;
  }
}

export async function assertCanCreateVaultItem(
  userId: string,
  category: string,
): Promise<{ ok: true } | { ok: false; message: string; state: SubscriptionState }> {
  const state = await getSubscriptionStateForUser(userId);
  if (state.appFreeOverride) return { ok: true };

  const normalized = String(category || "login").toLowerCase();
  const isNote = normalized.includes("note");
  const query = {
    userId: new ObjectId(userId),
    deleted: { $ne: true },
    deleted_at: null,
  };
  const total = await db
    .getDb()
    .collection(COLLECTIONS.vaultItems)
    .countDocuments(query);
  const notes = await db
    .getDb()
    .collection(COLLECTIONS.vaultItems)
    .countDocuments({ ...query, category: /note/i });

  if (!state.entitlements.canUseUnlimitedPasswords && !isNote && total >= state.limits.maxPasswords) {
    return {
      ok: false,
      message: `Free plan supports up to ${state.limits.maxPasswords} passwords.`,
      state,
    };
  }
  if (!state.entitlements.canUseUnlimitedNotes && isNote && notes >= state.limits.maxSecureNotes) {
    return {
      ok: false,
      message: `Free plan supports up to ${state.limits.maxSecureNotes} secure notes.`,
      state,
    };
  }
  return { ok: true };
}

/**
 * Free-tier document upload cap (Documents module). Pro / appFreeOverride → unlimited.
 */
export async function assertCanUploadDocument(
  userId: string,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; message: string; state: SubscriptionState }> {
  const state = await getSubscriptionStateForUser(userId);
  if (state.appFreeOverride || state.isPro) {
    return { ok: true, state };
  }

  const maxDocuments = state.limits.maxDocuments ?? SUBSCRIPTION_CONFIG.freeLimits.maxDocuments;
  if (maxDocuments >= Number.MAX_SAFE_INTEGER / 2) {
    return { ok: true, state };
  }

  const total = await db.getDb().collection(COLLECTIONS.documents).countDocuments({
    $or: [{ userId: new ObjectId(userId) }, { userId }],
    deleted: { $ne: true },
  });

  if (total >= maxDocuments) {
    return {
      ok: false,
      message: `Free plan supports up to ${maxDocuments} documents.`,
      state,
    };
  }
  return { ok: true, state };
}

export async function getSubscriptionOfferings() {
  const rc = await fetchRevenueCatOfferings();
  if (!rc) {
    return {
      currentOfferingId: SUBSCRIPTION_CONFIG.offeringDefault,
      offerings: [],
    };
  }
  return {
    currentOfferingId: rc.current_offering_id || SUBSCRIPTION_CONFIG.offeringDefault,
    offerings: rc.offerings || [],
  };
}

export async function syncPurchaseForUser(userId: string): Promise<SubscriptionState> {
  const refreshed = await refreshSubscriptionStateFromRevenueCat(userId);
  return applyAppFreeOverrideForUser(userId, refreshed);
}

export async function getSubscriptionDebugSnapshot(userId: string): Promise<{
  currentState: SubscriptionState;
  storedState: SubscriptionState;
  lastWebhookEvent: {
    eventId: string;
    eventType: string;
    processedAt: string | null;
    status?: string;
  } | null;
  recentEvents: Array<{
    eventId: string;
    eventType: string;
    processedAt: string | null;
    status?: string;
  }>;
  metadata: {
    revenueCatConfigured: boolean;
    revenueCatProjectIdPresent: boolean;
    webhookSecretConfigured: boolean;
    entitlementPro: string;
    generatedAt: string;
  };
}> {
  const [storedRaw, currentRaw, events] = await Promise.all([
    getPersistedSubscriptionStateForUser(userId),
    refreshSubscriptionStateFromRevenueCat(userId),
    listSubscriptionEventsForUser(userId, 10),
  ]);
  const [storedState, currentState] = await Promise.all([
    applyAppFreeOverrideForUser(userId, storedRaw),
    applyAppFreeOverrideForUser(userId, currentRaw),
  ]);

  return {
    currentState,
    storedState,
    lastWebhookEvent: events[0] || null,
    recentEvents: events,
    metadata: {
      revenueCatConfigured: Boolean(SUBSCRIPTION_CONFIG.apiKey),
      revenueCatProjectIdPresent: Boolean(SUBSCRIPTION_CONFIG.projectId),
      webhookSecretConfigured: isWebhookSecretConfigured(),
      entitlementPro: SUBSCRIPTION_CONFIG.entitlementPro,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function getMembershipOverviewForUser(userId: string): Promise<{
  subscription: SubscriptionState;
  recentActivity: Array<{ eventType: string; processedAt: string | null; status?: string }>;
  purchases: Array<{
    eventId: string;
    eventType: string;
    productId: string | null;
    transactionId: string | null;
    store: string | null;
    environment: string | null;
    purchasedAt: string | null;
  }>;
}> {
  const [subscription, recentActivity, purchases] = await Promise.all([
    getSubscriptionStateForUser(userId, { forceRefresh: false }),
    listSubscriptionEventsForUser(userId, 25),
    listPurchaseHistoryForUser(userId, 25),
  ]);
  return {
    subscription,
    recentActivity: recentActivity.map((e) => ({
      eventType: e.eventType,
      processedAt: e.processedAt,
      status: e.status,
    })),
    purchases,
  };
}

export async function getPurchaseHistoryForUser(userId: string, limit = 25) {
  return listPurchaseHistoryForUser(userId, limit);
}
