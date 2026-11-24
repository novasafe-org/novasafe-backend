import {
  EntitlementKey,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  SUBSCRIPTION_CONFIG,
} from "../config/subscription.config";
import type {
  RevenueCatSubscriberResponse,
  RevenueCatSubscriptionRow,
} from '../services/revenue-cat.service';
import {
  isEntitlementCurrentlyActive,
  resolveProFromSubscriber,
} from "./entitlementResolver";
import type {
  PlanTier,
  SubscriptionLifecycleStatus,
  SubscriptionState,
} from "./types";

function freeLimits() {
  return {
    maxVaultItems: SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems,
    maxPasswords: SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
    maxSecureNotes: SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
    maxDevices: SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
    maxDocuments: SUBSCRIPTION_CONFIG.freeLimits.maxDocuments,
  };
}

function proLimits() {
  return {
    maxVaultItems: Number.MAX_SAFE_INTEGER,
    maxPasswords: Number.MAX_SAFE_INTEGER,
    maxSecureNotes: Number.MAX_SAFE_INTEGER,
    maxDevices: Number.MAX_SAFE_INTEGER,
    maxDocuments: Number.MAX_SAFE_INTEGER,
  };
}

export function defaultSubscriptionState(now = new Date()): SubscriptionState {
  return withTierEntitlements(
    {
      tier: "free",
      isPro: false,
      productId: null,
      entitlementId: null,
      isActive: false,
      expiresAt: null,
      renewsAt: null,
      purchasedAt: null,
      lastRenewalAt: null,
      cancellationAt: null,
      inGracePeriod: false,
      billingIssueDetectedAt: null,
      trialEndsAt: null,
      platform: null,
      autoRenewing: false,
      subscriptionProvider: "revenuecat",
      subscriptionStatus: "inactive",
      entitlements: { ...FREE_ENTITLEMENTS },
      limits: freeLimits(),
      appFreeOverride: false,
      isReadOnly: false,
      updatedAt: now.toISOString(),
    },
    "free",
  );
}

export function isProFromState(state: Partial<SubscriptionState>): boolean {
  if (!state.isActive) return false;
  if (!state.expiresAt) return Boolean(state.tier === "pro");
  const exp = new Date(state.expiresAt).getTime();
  return state.tier === "pro" && !Number.isNaN(exp) && exp > Date.now();
}

/** Soft 7-day window after Pro expiry — writes still allowed; clients show renewal UI. */
export const POST_EXPIRY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when Pro expired recently and we are still inside the 7-day soft grace.
 */
export function isWithinPostExpiryGrace(
  state: Partial<SubscriptionState>,
  now = Date.now(),
): boolean {
  if (state.appFreeOverride) return false;
  if (state.inGracePeriod) return false;
  if (isProFromState(state) || state.isPro) return false;
  if (!state.expiresAt) return false;
  const exp = new Date(state.expiresAt).getTime();
  if (Number.isNaN(exp) || now <= exp) return false;
  return now <= exp + POST_EXPIRY_GRACE_MS;
}

/**
 * Lapsed Pro: previously entitled, no longer Pro — vault is view-only.
 * Never-subscribed Free users are NOT read-only (they use Free caps instead).
 * Within 7 days post-expiry: not read-only (renewal banner on client).
 */
export function isLapsedProReadOnly(state: Partial<SubscriptionState>): boolean {
  if (state.appFreeOverride) return false;
  if (state.inGracePeriod) return false;
  if (isProFromState(state) || state.isPro) return false;
  if (isWithinPostExpiryGrace(state)) return false;

  const status = String(state.subscriptionStatus || "");
  if (status === "expired" || status === "cancelled" || status === "billing_issue") {
    return true;
  }
  if (state.purchasedAt || state.lastRenewalAt || state.cancellationAt) return true;
  if (state.productId || state.entitlementId) return true;
  if (state.expiresAt) {
    const exp = new Date(state.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= Date.now()) return true;
  }
  return false;
}

export function withTierEntitlements(
  state: SubscriptionState,
  tier: PlanTier,
): SubscriptionState {
  const grantPro = tier === "pro" && (state.isActive || state.inGracePeriod);
  const isPro = grantPro;
  const effectiveTier: PlanTier = grantPro ? "pro" : "free";
  const next: SubscriptionState = {
    ...state,
    tier: effectiveTier,
    isPro,
    entitlements: grantPro ? { ...PRO_ENTITLEMENTS } : { ...FREE_ENTITLEMENTS },
    limits: grantPro ? proLimits() : freeLimits(),
    appFreeOverride: Boolean(state.appFreeOverride),
  };
  next.isReadOnly = isLapsedProReadOnly(next);
  return next;
}

/**
 * Ops unlock: treat the account as Pro for entitlements/limits without a paid subscription.
 * Does not mutate persisted RevenueCat state — applied at read time from vaultUsers.appFreeOverride.
 */
export function withAppFreeOverride(state: SubscriptionState): SubscriptionState {
  const granted = withTierEntitlements(
    {
      ...state,
      isActive: true,
      inGracePeriod: false,
      // Clear billing expiry so clients that gate on expiresAt still treat override as Pro.
      expiresAt: null,
      renewsAt: null,
      subscriptionStatus: "active",
      tier: "pro",
      appFreeOverride: true,
    },
    "pro",
  );
  return {
    ...granted,
    isPro: true,
    appFreeOverride: true,
    isReadOnly: false,
  };
}

function deriveLifecycleStatus(input: {
  isActive: boolean;
  inGracePeriod: boolean;
  billingIssueDetectedAt: string | null;
  cancellationAt: string | null;
  autoRenewing: boolean;
  expiresAt: string | null;
  eventType?: string;
}): SubscriptionLifecycleStatus {
  const now = Date.now();
  if (input.billingIssueDetectedAt) return "billing_issue";
  if (input.inGracePeriod) return "grace_period";
  if (input.isActive) {
    if (input.cancellationAt && !input.autoRenewing) return "cancelled";
    return "active";
  }
  if (input.eventType === "EXPIRATION") return "expired";
  if (input.expiresAt) {
    const exp = new Date(input.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) return "expired";
  }
  if (input.eventType === "CANCELLATION" && input.cancellationAt) return "cancelled";
  return "inactive";
}

/** Best-effort history from expired / leftover subscription rows when entitlement is gone. */
function latestSubscriptionHistory(
  subscriptions: Record<string, RevenueCatSubscriptionRow> | undefined | null,
): {
  productId: string | null;
  expiresAt: string | null;
  purchasedAt: string | null;
  cancellationAt: string | null;
  billingIssueDetectedAt: string | null;
  store: string | null;
} | null {
  if (!subscriptions || typeof subscriptions !== "object") return null;
  let best: {
    productId: string;
    expiresAtMs: number;
    expiresAt: string | null;
    purchasedAt: string | null;
    cancellationAt: string | null;
    billingIssueDetectedAt: string | null;
    store: string | null;
  } | null = null;

  for (const [productId, row] of Object.entries(subscriptions)) {
    if (!row || typeof row !== "object") continue;
    const expiresAt = row.expires_date ?? null;
    const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
    if (best && expiresAtMs < best.expiresAtMs) continue;
    best = {
      productId,
      expiresAtMs: Number.isNaN(expiresAtMs) ? 0 : expiresAtMs,
      expiresAt,
      purchasedAt: row.original_purchase_date ?? row.purchase_date ?? null,
      cancellationAt: row.unsubscribe_detected_at ?? null,
      billingIssueDetectedAt: row.billing_issues_detected_at ?? null,
      store: row.store ?? null,
    };
  }
  if (!best) return null;
  return {
    productId: best.productId,
    expiresAt: best.expiresAt,
    purchasedAt: best.purchasedAt,
    cancellationAt: best.cancellationAt,
    billingIssueDetectedAt: best.billingIssueDetectedAt,
    store: best.store,
  };
}

export function mapRevenueCatSubscriberToState(
  rc: RevenueCatSubscriberResponse | null,
  options?: {
    lastEventType?: string | null;
    previousState?: SubscriptionState | null;
  },
): SubscriptionState {
  const base = defaultSubscriptionState();
  if (!rc?.subscriber) return base;

  const resolved = resolveProFromSubscriber({
    entitlements: rc.subscriber.entitlements,
    subscriptions: rc.subscriber.subscriptions,
  });
  const isActive = isEntitlementCurrentlyActive(resolved);
  let productId = resolved?.productIdentifier || null;
  let subscriptionRecord = productId ? rc.subscriber.subscriptions?.[productId] : undefined;

  let expiresAt = resolved?.expiresDate || subscriptionRecord?.expires_date || null;
  const graceExpires =
    resolved?.gracePeriodExpiresDate || subscriptionRecord?.grace_period_expires_date || null;
  const inGracePeriod = Boolean(graceExpires && new Date(graceExpires).getTime() > Date.now());
  let billingIssueDetectedAt = subscriptionRecord?.billing_issues_detected_at || null;
  let cancellationAt = subscriptionRecord?.unsubscribe_detected_at || null;
  const autoRenewing = isActive && !cancellationAt;
  let purchasedAt =
    resolved?.purchaseDate ||
    subscriptionRecord?.original_purchase_date ||
    subscriptionRecord?.purchase_date ||
    options?.previousState?.purchasedAt ||
    null;
  let platform = subscriptionRecord?.store || null;
  let entitlementId = resolved?.entitlementId || null;

  if (!isActive && !inGracePeriod) {
    const history = latestSubscriptionHistory(rc.subscriber.subscriptions);
    if (history) {
      productId = productId || history.productId || options?.previousState?.productId || null;
      expiresAt = expiresAt || history.expiresAt || options?.previousState?.expiresAt || null;
      purchasedAt = purchasedAt || history.purchasedAt || options?.previousState?.purchasedAt || null;
      cancellationAt =
        cancellationAt || history.cancellationAt || options?.previousState?.cancellationAt || null;
      billingIssueDetectedAt =
        billingIssueDetectedAt ||
        history.billingIssueDetectedAt ||
        options?.previousState?.billingIssueDetectedAt ||
        null;
      platform = platform || history.store || options?.previousState?.platform || null;
      entitlementId =
        entitlementId || options?.previousState?.entitlementId || SUBSCRIPTION_CONFIG.entitlementPro;
    } else if (options?.previousState) {
      productId = productId || options.previousState.productId;
      expiresAt = expiresAt || options.previousState.expiresAt;
      purchasedAt = purchasedAt || options.previousState.purchasedAt;
      cancellationAt = cancellationAt || options.previousState.cancellationAt;
      entitlementId = entitlementId || options.previousState.entitlementId;
      platform = platform || options.previousState.platform;
    }
  }

  const eventType = String(options?.lastEventType || "").toUpperCase();
  let lastRenewalAt = options?.previousState?.lastRenewalAt || null;
  if (eventType === "RENEWAL" || eventType === "INITIAL_PURCHASE" || eventType === "PRODUCT_CHANGE") {
    lastRenewalAt = new Date().toISOString();
  } else if (subscriptionRecord?.purchase_date && isActive) {
    lastRenewalAt = subscriptionRecord.purchase_date;
  }

  const subscriptionStatus = deriveLifecycleStatus({
    isActive,
    inGracePeriod,
    billingIssueDetectedAt,
    cancellationAt,
    autoRenewing,
    expiresAt,
    eventType,
  });

  const tier: PlanTier = isActive || inGracePeriod ? "pro" : "free";
  return withTierEntitlements(
    {
      ...base,
      isActive,
      productId,
      entitlementId,
      expiresAt,
      renewsAt: expiresAt,
      purchasedAt,
      lastRenewalAt,
      cancellationAt,
      inGracePeriod,
      billingIssueDetectedAt,
      autoRenewing,
      platform,
      subscriptionStatus,
      updatedAt: new Date().toISOString(),
    },
    tier,
  );
}

export function hasEntitlement(state: SubscriptionState, key: EntitlementKey): boolean {
  if (state.appFreeOverride) return Boolean(PRO_ENTITLEMENTS[key]);
  if (state.inGracePeriod) return Boolean(PRO_ENTITLEMENTS[key]);
  if (isProFromState(state)) return Boolean(PRO_ENTITLEMENTS[key]);
  return Boolean(state.entitlements[key]);
}
