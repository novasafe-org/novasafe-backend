import type { EntitlementKey } from "../config/subscription.config";

export type PlanTier = "free" | "pro";

export type SubscriptionProvider = "revenuecat";

export type SubscriptionLifecycleStatus =
  | "active"
  | "inactive"
  | "cancelled"
  | "expired"
  | "billing_issue"
  | "grace_period";

export type EntitlementMap = Record<EntitlementKey, boolean>;

/** Canonical subscription document stored per user (API + DB). */
export type SubscriptionState = {
  tier: PlanTier;
  /** Mirrors tier === "pro" && isActive for clients that expect an explicit flag. */
  isPro: boolean;
  productId: string | null;
  entitlementId: string | null;
  isActive: boolean;
  expiresAt: string | null;
  renewsAt: string | null;
  purchasedAt: string | null;
  lastRenewalAt: string | null;
  cancellationAt: string | null;
  inGracePeriod: boolean;
  billingIssueDetectedAt: string | null;
  trialEndsAt: string | null;
  platform: string | null;
  autoRenewing: boolean;
  subscriptionProvider: SubscriptionProvider;
  subscriptionStatus: SubscriptionLifecycleStatus;
  entitlements: EntitlementMap;
  limits: {
    maxPasswords: number;
    maxSecureNotes: number;
    maxDevices: number;
  };
  updatedAt: string;
};

export const REVENUECAT_WEBHOOK_EVENT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_PAUSED",
  "TRANSFER",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "INVOICE_ISSUANCE",
  "TEST",
] as const;

export type RevenueCatWebhookEventType = (typeof REVENUECAT_WEBHOOK_EVENT_TYPES)[number];

export type RevenueCatWebhookPayload = {
  api_version?: string;
  id?: string;
  event?: RevenueCatWebhookEventBody;
};

export type RevenueCatWebhookEventBody = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  auto_resume_at_ms?: number | null;
  store?: string;
  environment?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  cancellation_reason?: string | null;
  price?: number | null;
  currency?: string | null;
};

export type WebhookProcessResult = {
  status: number;
  message: string;
  eventId?: string;
  eventType?: string;
  duplicate?: boolean;
};

export type SubscriptionEventRecord = {
  eventId: string;
  eventType: string;
  userId: string | null;
  transactionId: string | null;
  status: "processing" | "completed" | "failed" | "ignored";
  payload: unknown;
  errorMessage?: string | null;
  processedAt: Date;
  createdAt: Date;
};
