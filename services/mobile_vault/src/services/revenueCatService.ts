import { SUBSCRIPTION_CONFIG } from "../config/subscriptionConfig";

type RevenueCatCustomerResponse = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        product_identifier?: string;
      }
    >;
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        original_purchase_date?: string | null;
        purchase_date?: string | null;
        store?: string;
        ownership_type?: string;
      }
    >;
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

async function rcFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  if (!SUBSCRIPTION_CONFIG.apiKey) return null;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${SUBSCRIPTION_CONFIG.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function fetchRevenueCatSubscriberByAppUserId(
  appUserId: string,
): Promise<RevenueCatCustomerResponse | null> {
  const encoded = encodeURIComponent(appUserId);
  return rcFetch<RevenueCatCustomerResponse>(
    `${SUBSCRIPTION_CONFIG.apiBaseUrl}/subscribers/${encoded}`,
  );
}

export async function fetchRevenueCatOfferings(): Promise<RevenueCatOfferingResponse | null> {
  if (!SUBSCRIPTION_CONFIG.projectId) return null;
  return rcFetch<RevenueCatOfferingResponse>(
    `${SUBSCRIPTION_CONFIG.apiBaseUrl}/projects/${SUBSCRIPTION_CONFIG.projectId}/offerings`,
  );
}
