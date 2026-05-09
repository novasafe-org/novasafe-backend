import { ObjectId } from "mongodb";
import crypto from "crypto";
import { DB_CONFIG } from "../config/dbConfig";
import {
  EntitlementKey,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  SUBSCRIPTION_CONFIG,
} from "../config/subscriptionConfig";
import Database from "../database/connection";
import {
  fetchRevenueCatOfferings,
  fetchRevenueCatSubscriberByAppUserId,
} from "./revenueCatService";
import { sendSubscriptionLifecycleEmail } from "./subscriptionEmailService";

type EntitlementMap = Record<EntitlementKey, boolean>;

export type SubscriptionState = {
  tier: "free" | "pro";
  productId: string | null;
  entitlementId: string | null;
  isActive: boolean;
  expiresAt: string | null;
  renewsAt: string | null;
  cancellationAt: string | null;
  inGracePeriod: boolean;
  billingIssueDetectedAt: string | null;
  trialEndsAt: string | null;
  platform: string | null;
  autoRenewing: boolean;
  entitlements: EntitlementMap;
  limits: {
    maxPasswords: number;
    maxSecureNotes: number;
    maxDevices: number;
  };
  updatedAt: string;
};

type RevenueCatWebhookEvent = {
  id?: string;
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    product_id?: string;
    entitlement_id?: string;
    expiration_at_ms?: number | null;
    purchased_at_ms?: number | null;
    store?: string;
    environment?: string;
  };
  api_version?: string;
};

const db = new Database(DB_CONFIG.databaseName);

export async function ensureSubscriptionIndexes(): Promise<void> {
  await db.connect();
  const dbc = db.getDb();
  await Promise.all([
    dbc
      .collection(DB_CONFIG.collections.subscriptions)
      .createIndex({ userId: 1 }, { unique: true }),
    dbc
      .collection(DB_CONFIG.collections.subscriptionEvents)
      .createIndex({ eventId: 1 }, { unique: true }),
    dbc
      .collection(DB_CONFIG.collections.subscriptionEvents)
      .createIndex({ userId: 1, processedAt: -1 }),
    dbc
      .collection(DB_CONFIG.collections.purchaseHistory)
      .createIndex({ userId: 1, createdAt: -1 }),
  ]);
}

function defaultState(now = new Date()): SubscriptionState {
  return {
    tier: "free",
    productId: null,
    entitlementId: null,
    isActive: false,
    expiresAt: null,
    renewsAt: null,
    cancellationAt: null,
    inGracePeriod: false,
    billingIssueDetectedAt: null,
    trialEndsAt: null,
    platform: null,
    autoRenewing: false,
    entitlements: { ...FREE_ENTITLEMENTS },
    limits: {
      maxPasswords: SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
      maxSecureNotes: SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
      maxDevices: SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
    },
    updatedAt: now.toISOString(),
  };
}

function isProFromState(state: Partial<SubscriptionState>): boolean {
  if (!state.isActive) return false;
  if (!state.expiresAt) return true;
  const exp = new Date(state.expiresAt).getTime();
  return !Number.isNaN(exp) && exp > Date.now();
}

function withTierEntitlements(
  state: SubscriptionState,
  tier: "free" | "pro",
): SubscriptionState {
  return {
    ...state,
    tier,
    entitlements: tier === "pro" ? { ...PRO_ENTITLEMENTS } : { ...FREE_ENTITLEMENTS },
    limits: {
      maxPasswords:
        tier === "pro" ? Number.MAX_SAFE_INTEGER : SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
      maxSecureNotes:
        tier === "pro" ? Number.MAX_SAFE_INTEGER : SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
      maxDevices:
        tier === "pro" ? Number.MAX_SAFE_INTEGER : SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
    },
  };
}

async function getUserById(userId: string) {
  if (!ObjectId.isValid(userId)) return null;
  return db.findOne(DB_CONFIG.collections.vaultUsers, { _id: new ObjectId(userId) });
}

export async function getPersistedSubscriptionState(
  userId: string,
): Promise<SubscriptionState> {
  const stored = await db.findOne(DB_CONFIG.collections.subscriptions, {
    userId: new ObjectId(userId),
  });
  if (!stored) return defaultState();
  const current = {
    ...defaultState(),
    ...(stored.state || {}),
  } as SubscriptionState;
  const tier = isProFromState(current) ? "pro" : "free";
  return withTierEntitlements({ ...current, updatedAt: new Date().toISOString() }, tier);
}

async function persistSubscriptionState(
  userId: string,
  state: SubscriptionState,
): Promise<void> {
  await db
    .getDb()
    .collection(DB_CONFIG.collections.subscriptions)
    .updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: {
          userId: new ObjectId(userId),
          state,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
}

export async function refreshSubscriptionStateFromRevenueCat(
  userId: string,
): Promise<SubscriptionState> {
  const user = await getUserById(userId);
  if (!user) return defaultState();
  const appUserId = String(user._id);
  const rc = await fetchRevenueCatSubscriberByAppUserId(appUserId);
  const base = defaultState();
  if (!rc?.subscriber) {
    await persistSubscriptionState(userId, base);
    return base;
  }

  const entitlement = rc.subscriber.entitlements?.[SUBSCRIPTION_CONFIG.entitlementPro];
  const expiresAt = entitlement?.expires_date || null;
  const isActive =
    Boolean(entitlement) &&
    (!expiresAt || new Date(expiresAt).getTime() > Date.now());
  const productId = entitlement?.product_identifier || null;
  const subscriptionRecord = productId
    ? rc.subscriber.subscriptions?.[productId]
    : undefined;
  const platform = subscriptionRecord?.store || null;
  const next = withTierEntitlements(
    {
      ...base,
      isActive,
      productId,
      entitlementId: SUBSCRIPTION_CONFIG.entitlementPro,
      expiresAt,
      renewsAt: expiresAt,
      autoRenewing: isActive,
      platform,
      updatedAt: new Date().toISOString(),
    },
    isActive ? "pro" : "free",
  );
  await persistSubscriptionState(userId, next);
  return next;
}

export async function getSubscriptionStateForUser(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<SubscriptionState> {
  if (options?.forceRefresh) {
    return refreshSubscriptionStateFromRevenueCat(userId);
  }
  return getPersistedSubscriptionState(userId);
}

export function hasEntitlement(state: SubscriptionState, key: EntitlementKey): boolean {
  return Boolean(state.entitlements[key]);
}

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
    .collection(DB_CONFIG.collections.vaultItems)
    .countDocuments(query);
  const notes = await db
    .getDb()
    .collection(DB_CONFIG.collections.vaultItems)
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

async function storeWebhookAudit(
  userId: string | null,
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  await db.insertOne(DB_CONFIG.collections.subscriptionEvents, {
    userId: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null,
    eventId,
    eventType,
    payload,
    processedAt: new Date(),
    createdAt: new Date(),
  });
}

async function hasProcessedEvent(eventId: string): Promise<boolean> {
  const existing = await db.findOne(DB_CONFIG.collections.subscriptionEvents, { eventId });
  return Boolean(existing);
}

export async function processRevenueCatWebhook(
  body: RevenueCatWebhookEvent,
  signatureHeader: string | undefined,
): Promise<{ status: number; message: string }> {
  if (!SUBSCRIPTION_CONFIG.webhookSecret) {
    return { status: 500, message: "Webhook secret not configured" };
  }
  const provided = Buffer.from(signatureHeader || "", "utf8");
  const expected = Buffer.from(SUBSCRIPTION_CONFIG.webhookSecret, "utf8");
  const signatureOk =
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected);
  if (!signatureOk) {
    return { status: 401, message: "Invalid webhook signature" };
  }
  const eventId = String(body.event?.id || body.id || "");
  const eventType = String(body.event?.type || "UNKNOWN");
  const appUserId = String(body.event?.app_user_id || "");
  if (!eventId || !appUserId || !ObjectId.isValid(appUserId)) {
    return { status: 400, message: "Invalid webhook payload" };
  }
  if (await hasProcessedEvent(eventId)) {
    return { status: 200, message: "Duplicate ignored" };
  }

  const state = await refreshSubscriptionStateFromRevenueCat(appUserId);
  try {
    await storeWebhookAudit(appUserId, eventId, eventType, body);
  } catch (error: any) {
    if (String(error?.message || "").includes("E11000")) {
      return { status: 200, message: "Duplicate ignored" };
    }
    throw error;
  }

  const user = await getUserById(appUserId);
  const email = user?.email ? String(user.email) : null;
  if (email) {
    const emailMap: Record<string, Parameters<typeof sendSubscriptionLifecycleEmail>[1]> = {
      INITIAL_PURCHASE: "purchase_successful",
      RENEWAL: "subscription_renewed",
      CANCELLATION: "subscription_cancelled",
      EXPIRATION: "subscription_expired",
      BILLING_ISSUE: "payment_failed",
      PRODUCT_CHANGE: "subscription_renewed",
      UNCANCELLATION: "subscription_renewed",
      SUBSCRIPTION_PAUSED: "subscription_cancelled",
      TRANSFER: "restore_successful",
    };
    const template = emailMap[eventType];
    if (template) {
      await sendSubscriptionLifecycleEmail(email, template, {
        planName: state.tier === "pro" ? "NovaSafe Pro" : "NovaSafe Free",
        renewalDate: state.renewsAt,
      });
    }
  }

  return { status: 200, message: "Webhook processed" };
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
  } | null;
  recentEvents: Array<{
    eventId: string;
    eventType: string;
    processedAt: string | null;
  }>;
  metadata: {
    revenueCatConfigured: boolean;
    revenueCatProjectIdPresent: boolean;
    entitlementPro: string;
    generatedAt: string;
  };
}> {
  const [storedState, currentState, events] = await Promise.all([
    getPersistedSubscriptionState(userId),
    refreshSubscriptionStateFromRevenueCat(userId),
    db.findMany(
      DB_CONFIG.collections.subscriptionEvents,
      { userId: new ObjectId(userId) },
      { limit: 10, sort: { processedAt: -1 } },
    ),
  ]);

  const mapped = (events || []).map((e: any) => ({
    eventId: String(e?.eventId || ""),
    eventType: String(e?.eventType || "UNKNOWN"),
    processedAt: e?.processedAt ? new Date(e.processedAt).toISOString() : null,
  }));

  return {
    currentState,
    storedState,
    lastWebhookEvent: mapped[0] || null,
    recentEvents: mapped,
    metadata: {
      revenueCatConfigured: Boolean(SUBSCRIPTION_CONFIG.apiKey),
      revenueCatProjectIdPresent: Boolean(SUBSCRIPTION_CONFIG.projectId),
      entitlementPro: SUBSCRIPTION_CONFIG.entitlementPro,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** App membership screen: persisted subscription + recent RevenueCat webhook activity for this user. */
export async function getMembershipOverviewForUser(userId: string): Promise<{
  subscription: SubscriptionState;
  recentActivity: Array<{ eventType: string; processedAt: string | null }>;
}> {
  const subscription = await getSubscriptionStateForUser(userId, { forceRefresh: false });
  const events = await db.findMany(
    DB_CONFIG.collections.subscriptionEvents,
    { userId: new ObjectId(userId) },
    { limit: 25, sort: { processedAt: -1 } },
  );
  const recentActivity = (events || []).map((e: any) => ({
    eventType: String(e?.eventType || "UNKNOWN"),
    processedAt: e?.processedAt ? new Date(e.processedAt).toISOString() : null,
  }));
  return { subscription, recentActivity };
}
