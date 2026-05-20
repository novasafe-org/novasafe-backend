import { sendSubscriptionLifecycleEmail } from "../services/subscriptionEmailService";
import type { ParsedRevenueCatWebhook } from "./revenueCatWebhookParser";
import { webhookLog } from "./subscriptionLogger";
import { recordPurchaseHistory } from "./subscriptionRepository";
import type { SubscriptionState } from "./types";

const PURCHASE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "SUBSCRIPTION_EXTENDED",
  "TRANSFER",
]);

const EMAIL_BY_EVENT: Record<string, Parameters<typeof sendSubscriptionLifecycleEmail>[1]> = {
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

export async function runPostSyncWebhookSideEffects(input: {
  parsed: ParsedRevenueCatWebhook;
  userId: string;
  userEmail: string | null;
  state: SubscriptionState;
}): Promise<void> {
  const { parsed, userId, userEmail, state } = input;

  if (PURCHASE_EVENT_TYPES.has(parsed.eventType)) {
    await recordPurchaseHistory({
      userId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      productId: parsed.productId,
      transactionId: parsed.transactionId,
      store: parsed.store,
      environment: parsed.environment,
      purchasedAt: parsed.purchasedAt,
    }).catch((err) => {
      webhookLog.warn({ err, eventId: parsed.eventId }, "Failed to record purchase history");
    });
  }

  const template = EMAIL_BY_EVENT[parsed.eventType];
  if (template && userEmail) {
    await sendSubscriptionLifecycleEmail(userEmail, template, {
      planName: state.tier === "pro" ? "NovaSafe Pro" : "NovaSafe Free",
      renewalDate: state.renewsAt,
    }).catch((err) => {
      webhookLog.warn({ err, eventId: parsed.eventId }, "Failed to send subscription lifecycle email");
    });
  }

  webhookLog.info(
    {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      userId,
      tier: state.tier,
      subscriptionStatus: state.subscriptionStatus,
      isActive: state.isActive,
    },
    "Webhook side effects completed",
  );
}
