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
  withTierEntitlements,
} from "../revenuecat/subscriptionStateMapper";
import {
  getPersistedSubscriptionState,
  listSubscriptionEventsForUser,
} from "../revenuecat/subscriptionRepository";
import type { SubscriptionState } from "../revenuecat/types";

export type { SubscriptionState } from "../revenuecat/types";

const db = getNativeMongo();

export { ensureSubscriptionIndexes };
export { processRevenueCatWebhook } from "../revenuecat/revenueCatWebhookProcessor";

export async function getSubscriptionStateForUser(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<SubscriptionState> {
  if (options?.forceRefresh) {
    return refreshSubscriptionStateFromRevenueCat(userId);
  }
  return getPersistedSubscriptionStateForUser(userId);
}

export async function getPersistedSubscriptionStateForUser(userId: string): Promise<SubscriptionState> {
  const stored = await getPersistedSubscriptionState(userId);
  const current = stored ? { ...defaultSubscriptionState(), ...stored } : defaultSubscriptionState();
  const tier = isProFromState(current) ? "pro" : "free";
  return withTierEntitlements({ ...current, updatedAt: new Date().toISOString() }, tier);
}

export { hasEntitlement };

export async function assertEntitlement(
  userId: string,
  entitlement: EntitlementKey,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; state: SubscriptionState; message: string }> {
  const state = await getSubscriptionStateForUser(userId);
  if (hasEntitlement(state, entitlement)) return { ok: true, state };
  const messages: Record<EntitlementKey, string> = {
    canUseCloudSync: "Cloud sync requires NovaSafe Pro",
    canUseCSVImportExport: "CSV import/export requires NovaSafe Pro",
    canUseUnlimitedPasswords: "Unlimited passwords require NovaSafe Pro",
    canUseUnlimitedNotes: "Unlimited notes require NovaSafe Pro",
    canUsePasswordHistory: "Password history requires NovaSafe Pro",
    canUseAdvancedSecurity: "Advanced security analytics require NovaSafe Pro",
    canUseMultiDevice: "Multiple devices require NovaSafe Pro",
  };
  return { ok: false, state, message: messages[entitlement] };
}

export async function assertCanCreateVaultItem(
  userId: string,
  category: string,
): Promise<{ ok: true } | { ok: false; message: string; state: SubscriptionState }> {
  const state = await getSubscriptionStateForUser(userId);
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
  return refreshSubscriptionStateFromRevenueCat(userId);
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
  const [storedState, currentState, events] = await Promise.all([
    getPersistedSubscriptionStateForUser(userId),
    refreshSubscriptionStateFromRevenueCat(userId),
    listSubscriptionEventsForUser(userId, 10),
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
}> {
  const subscription = await getSubscriptionStateForUser(userId, { forceRefresh: false });
  const recentActivity = await listSubscriptionEventsForUser(userId, 25);
  return {
    subscription,
    recentActivity: recentActivity.map((e) => ({
      eventType: e.eventType,
      processedAt: e.processedAt,
      status: e.status,
    })),
  };
}
