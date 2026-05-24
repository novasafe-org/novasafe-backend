import { SUBSCRIPTION_CONFIG } from "../config/subscriptionConfig";
import type { RevenueCatSubscriptionRow } from "../services/revenueCatService";

export type ResolvedRevenueCatEntitlement = {
  entitlementId: string;
  expiresDate: string | null;
  gracePeriodExpiresDate: string | null;
  productIdentifier: string | null;
  purchaseDate: string | null;
};

type RevenueCatEntitlementRow = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

const FALLBACK_ENTITLEMENT_IDS = ["pro", "novasafe_pro"] as const;

const toResolved = (
  entitlementId: string,
  row: RevenueCatEntitlementRow,
): ResolvedRevenueCatEntitlement => ({
  entitlementId,
  expiresDate: row.expires_date ?? null,
  gracePeriodExpiresDate: row.grace_period_expires_date ?? null,
  productIdentifier: row.product_identifier ?? null,
  purchaseDate: row.purchase_date ?? null,
});

const preferredEntitlementIds = (): string[] =>
  [SUBSCRIPTION_CONFIG.entitlementPro, ...FALLBACK_ENTITLEMENT_IDS].filter(
    (id, index, arr) => id && arr.indexOf(id) === index,
  );

export function resolveProEntitlement(
  entitlementsMap: Record<string, RevenueCatEntitlementRow> | undefined | null,
): ResolvedRevenueCatEntitlement | null {
  if (!entitlementsMap || typeof entitlementsMap !== "object") return null;

  for (const id of preferredEntitlementIds()) {
    const row = entitlementsMap[id];
    if (!row) continue;
    const resolved = toResolved(id, row);
    if (isEntitlementCurrentlyActive(resolved)) return resolved;
  }

  for (const [id, row] of Object.entries(entitlementsMap)) {
    if (!row || typeof row !== "object") continue;
    const resolved = toResolved(id, row);
    if (isEntitlementCurrentlyActive(resolved)) return resolved;
  }

  return null;
}

export function resolveActiveStoreSubscription(
  subscriptions: Record<string, RevenueCatSubscriptionRow> | undefined | null,
  now = Date.now(),
): ResolvedRevenueCatEntitlement | null {
  if (!subscriptions || typeof subscriptions !== "object") return null;

  for (const [productId, row] of Object.entries(subscriptions)) {
    if (!row || typeof row !== "object") continue;
    const grace = row.grace_period_expires_date
      ? new Date(row.grace_period_expires_date).getTime()
      : NaN;
    if (!Number.isNaN(grace) && grace > now) {
      return {
        entitlementId: SUBSCRIPTION_CONFIG.entitlementPro,
        expiresDate: row.expires_date ?? row.grace_period_expires_date ?? null,
        gracePeriodExpiresDate: row.grace_period_expires_date ?? null,
        productIdentifier: productId,
        purchaseDate: row.purchase_date ?? row.original_purchase_date ?? null,
      };
    }
    const exp = row.expires_date ? new Date(row.expires_date).getTime() : NaN;
    if (!row.expires_date || (!Number.isNaN(exp) && exp > now)) {
      return {
        entitlementId: SUBSCRIPTION_CONFIG.entitlementPro,
        expiresDate: row.expires_date ?? null,
        gracePeriodExpiresDate: row.grace_period_expires_date ?? null,
        productIdentifier: productId,
        purchaseDate: row.purchase_date ?? row.original_purchase_date ?? null,
      };
    }
  }

  return null;
}

export function resolveProFromSubscriber(input: {
  entitlements?: Record<string, RevenueCatEntitlementRow> | null;
  subscriptions?: Record<string, RevenueCatSubscriptionRow> | null;
}): ResolvedRevenueCatEntitlement | null {
  return (
    resolveProEntitlement(input.entitlements) ||
    resolveActiveStoreSubscription(input.subscriptions)
  );
}

export function isEntitlementCurrentlyActive(
  resolved: ResolvedRevenueCatEntitlement | null,
  now = Date.now(),
): boolean {
  if (!resolved) return false;
  const grace = resolved.gracePeriodExpiresDate
    ? new Date(resolved.gracePeriodExpiresDate).getTime()
    : NaN;
  if (!Number.isNaN(grace) && grace > now) return true;
  if (!resolved.expiresDate) return true;
  const exp = new Date(resolved.expiresDate).getTime();
  return !Number.isNaN(exp) && exp > now;
}
