import {
  EntitlementKey,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  SUBSCRIPTION_CONFIG,
} from "../config/subscriptionConfig";
import type { RevenueCatSubscriberResponse } from "../services/revenueCatService";
import {
  isEntitlementCurrentlyActive,
  resolveProEntitlement,
} from "./entitlementResolver";
import type {
  PlanTier,
  SubscriptionLifecycleStatus,
  SubscriptionState,
} from "./types";

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
      limits: {
        maxPasswords: SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
        maxSecureNotes: SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
        maxDevices: SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
      },
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

export function withTierEntitlements(
  state: SubscriptionState,
  tier: PlanTier,
): SubscriptionState {
  const isPro = tier === "pro" && state.isActive;
  return {
    ...state,
    tier,
    isPro,
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

function deriveLifecycleStatus(input: {
  isActive: boolean;
  inGracePeriod: boolean;
  billingIssueDetectedAt: string | null;
  cancellationAt: string | null;
  autoRenewing: boolean;
  expiresAt: string | null;
}): SubscriptionLifecycleStatus {
  const now = Date.now();
  if (input.billingIssueDetectedAt) return "billing_issue";
  if (input.inGracePeriod) return "grace_period";
  if (input.isActive) {
    if (input.cancellationAt && !input.autoRenewing) return "cancelled";
    return "active";
  }
  if (input.expiresAt) {
    const exp = new Date(input.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) return "expired";
  }
  return "inactive";
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

  const resolved = resolveProEntitlement(rc.subscriber.entitlements);
  const isActive = isEntitlementCurrentlyActive(resolved);
  const productId = resolved?.productIdentifier || null;
  const subscriptionRecord = productId ? rc.subscriber.subscriptions?.[productId] : undefined;

  const expiresAt = resolved?.expiresDate || subscriptionRecord?.expires_date || null;
  const graceExpires =
    resolved?.gracePeriodExpiresDate || subscriptionRecord?.grace_period_expires_date || null;
  const inGracePeriod = Boolean(graceExpires && new Date(graceExpires).getTime() > Date.now());
  const billingIssueDetectedAt = subscriptionRecord?.billing_issues_detected_at || null;
  const cancellationAt = subscriptionRecord?.unsubscribe_detected_at || null;
  const autoRenewing = isActive && !cancellationAt;
  const purchasedAt =
    resolved?.purchaseDate ||
    subscriptionRecord?.original_purchase_date ||
    subscriptionRecord?.purchase_date ||
    options?.previousState?.purchasedAt ||
    null;

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
  });

  const tier: PlanTier = isActive ? "pro" : "free";
  return withTierEntitlements(
    {
      ...base,
      isActive,
      productId,
      entitlementId: resolved?.entitlementId || null,
      expiresAt,
      renewsAt: expiresAt,
      purchasedAt,
      lastRenewalAt,
      cancellationAt,
      inGracePeriod,
      billingIssueDetectedAt,
      autoRenewing,
      platform: subscriptionRecord?.store || null,
      subscriptionStatus,
      updatedAt: new Date().toISOString(),
    },
    tier,
  );
}

export function hasEntitlement(state: SubscriptionState, key: EntitlementKey): boolean {
  return Boolean(state.entitlements[key]);
}
