import { verifyRevenueCatWebhookAuth } from "./revenueCatWebhookAuth";
import { parseRevenueCatWebhookBody, resolveWebhookAppUserId } from "./revenueCatWebhookParser";
import { runPostSyncWebhookSideEffects } from "./revenueCatWebhookHandlers";
import { refreshSubscriptionStateFromRevenueCat } from "./revenueCatSubscriberSync";
import { webhookLog } from "./subscriptionLogger";
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  findVaultUserById,
} from "./subscriptionRepository";
import type { WebhookProcessResult } from "./types";

export async function processRevenueCatWebhook(
  body: unknown,
  authorizationHeader: string | undefined,
): Promise<WebhookProcessResult> {
  const auth = verifyRevenueCatWebhookAuth(authorizationHeader);
  if (auth.ok === false) {
    webhookLog.warn({ status: auth.status }, auth.message);
    return { status: auth.status, message: auth.message, duplicate: false };
  }

  const parsed = parseRevenueCatWebhookBody(body);
  if (!parsed) {
    webhookLog.warn("Malformed RevenueCat webhook payload");
    return { status: 400, message: "Invalid webhook payload" };
  }

  const userId = resolveWebhookAppUserId(parsed);
  if (!userId) {
    webhookLog.warn(
      { eventId: parsed.eventId, appUserId: parsed.appUserId },
      "Webhook ignored — no valid MongoDB user id",
    );
    await claimWebhookEvent({
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      userId: null,
      transactionId: parsed.transactionId,
      status: "ignored",
      payload: parsed.raw,
    }).catch(() => undefined);
    return {
      status: 200,
      message: "Ignored — unknown app_user_id",
      eventId: parsed.eventId,
      eventType: parsed.eventType,
    };
  }

  webhookLog.info(
    {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      userId,
      productId: parsed.productId,
      store: parsed.store,
    },
    "RevenueCat webhook received",
  );

  const claim = await claimWebhookEvent({
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    userId,
    transactionId: parsed.transactionId,
    status: "processing",
    payload: parsed.raw,
  });

  if (claim === "duplicate") {
    webhookLog.info({ eventId: parsed.eventId }, "Duplicate webhook ignored");
    return {
      status: 200,
      message: "Duplicate ignored",
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      duplicate: true,
    };
  }

  try {
    const user = await findVaultUserById(userId);
    if (!user) {
      await finalizeWebhookEvent(parsed.eventId, {
        status: "ignored",
        errorMessage: "User not found",
      });
      webhookLog.warn({ userId, eventId: parsed.eventId }, "User not found for webhook");
      return {
        status: 200,
        message: "Ignored — user not found",
        eventId: parsed.eventId,
        eventType: parsed.eventType,
      };
    }

    const state = await refreshSubscriptionStateFromRevenueCat(userId, {
      lastEventType: parsed.eventType,
    });

    const email = user?.email ? String(user.email) : null;
    await runPostSyncWebhookSideEffects({
      parsed,
      userId,
      userEmail: email,
      state,
    });

    await finalizeWebhookEvent(parsed.eventId, { status: "completed", errorMessage: null });

    return {
      status: 200,
      message: "Webhook processed",
      eventId: parsed.eventId,
      eventType: parsed.eventType,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    webhookLog.error(
      {
        err: error instanceof Error ? error.message : String(error),
        eventId: parsed.eventId,
        userId,
      },
      'Webhook processing failed',
    );
    await finalizeWebhookEvent(parsed.eventId, {
      status: "failed",
      errorMessage,
    }).catch(() => undefined);
    return {
      status: 500,
      message: "Webhook processing failed",
      eventId: parsed.eventId,
      eventType: parsed.eventType,
    };
  }
}
