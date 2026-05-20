import { SUBSCRIPTION_CONFIG } from "../config/subscriptionConfig";
import { syncLog } from "../subscription/subscriptionLogger";

export type RevenueCatEntitlementRow = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

export type RevenueCatSubscriptionRow = {
  expires_date?: string | null;
  original_purchase_date?: string | null;
  purchase_date?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  store?: string;
  ownership_type?: string;
  period_type?: string;
};

export type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlementRow>;
    subscriptions?: Record<string, RevenueCatSubscriptionRow>;
    first_seen?: string;
    original_app_user_id?: string;
  };
};

type RevenueCatOfferingResponse = {
  current_offering_id?: string;
  offerings?: Array<{
    identifier: string;
    server_description?: string;
    available_packages?: Array<{
      identifier: string;
      platform_product_identifier: string;
      platform_product_plan_identifier?: string | null;
      display_name?: string;
      display_price?: string;
      price_string?: string;
      price?: number;
      currency_code?: string;
    }>;
  }>;
};

function resolveRevenueCatServerApiKey(): string {
  return String(SUBSCRIPTION_CONFIG.apiKey || "").trim();
}

function isLikelyPublicSdkKey(key: string): boolean {
  return /^(goog_|appl_|rcbw_)/i.test(key);
}

async function rcFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  const apiKey = resolveRevenueCatServerApiKey();
  if (!apiKey) {
    syncLog.warn("RevenueCat secret API key missing — cannot call REST API");
    return null;
  }
  if (isLikelyPublicSdkKey(apiKey)) {
    syncLog.error(
      "REVENUECAT_API_KEY looks like a public SDK key (goog_/appl_). Use sk_ secret key on the server.",
    );
    return null;
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${SUBSCRIPTION_CONFIG.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    syncLog.error({ url, status: response.status }, "RevenueCat API request failed");
    return null;
  }
  return (await response.json()) as T;
}

export async function fetchRevenueCatSubscriberByAppUserId(
  appUserId: string,
): Promise<RevenueCatSubscriberResponse | null> {
  const encoded = encodeURIComponent(appUserId);
  return rcFetch<RevenueCatSubscriberResponse>(
    `${SUBSCRIPTION_CONFIG.apiBaseUrl}/subscribers/${encoded}`,
  );
}

export async function fetchRevenueCatOfferings(): Promise<RevenueCatOfferingResponse | null> {
  if (!SUBSCRIPTION_CONFIG.projectId) return null;
  return rcFetch<RevenueCatOfferingResponse>(
    `${SUBSCRIPTION_CONFIG.apiBaseUrl}/projects/${SUBSCRIPTION_CONFIG.projectId}/offerings`,
  );
}
