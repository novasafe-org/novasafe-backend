import { SUBSCRIPTION_CONFIG } from "../config/subscription.config";

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

/**
 * Resolves the NovaSafe Pro entitlement row from RevenueCat subscriber entitlements.
 * Configured id first, then known fallbacks — extensible via REVENUECAT_ENTITLEMENT_PRO.
 */
export function resolveProEntitlement(
  entitlementsMap: Record<string, RevenueCatEntitlementRow> | undefined | null,
): ResolvedRevenueCatEntitlement | null {
  if (!entitlementsMap || typeof entitlementsMap !== "object") return null;

  const preferred = [
    SUBSCRIPTION_CONFIG.entitlementPro,
    ...FALLBACK_ENTITLEMENT_IDS,
  ].filter((id, index, arr) => id && arr.indexOf(id) === index);

  for (const id of preferred) {
    const row = entitlementsMap[id];
    if (!row) continue;
    return {
      entitlementId: id,
      expiresDate: row.expires_date ?? null,
      gracePeriodExpiresDate: row.grace_period_expires_date ?? null,
      productIdentifier: row.product_identifier ?? null,
      purchaseDate: row.purchase_date ?? null,
    };
  }

  return null;
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
