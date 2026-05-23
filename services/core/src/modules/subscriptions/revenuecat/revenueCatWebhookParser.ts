import { ObjectId } from "mongodb";
import type { RevenueCatWebhookEventBody, RevenueCatWebhookPayload } from "./types";

export type ParsedRevenueCatWebhook = {
  eventId: string;
  eventType: string;
  appUserId: string;
  productId: string | null;
  entitlementIds: string[];
  transactionId: string | null;
  store: string | null;
  environment: string | null;
  purchasedAt: Date | null;
  expirationAt: Date | null;
  raw: RevenueCatWebhookPayload;
};

export function parseRevenueCatWebhookBody(body: unknown): ParsedRevenueCatWebhook | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as RevenueCatWebhookPayload;
  const event: RevenueCatWebhookEventBody | undefined = payload.event;
  if (!event || typeof event !== "object") return null;

  const eventId = String(event.id || payload.id || "").trim();
  const eventType = String(event.type || "UNKNOWN").trim().toUpperCase();
  const appUserId = String(event.app_user_id || event.original_app_user_id || "").trim();

  if (!eventId || !appUserId) return null;

  const purchasedAt =
    typeof event.purchased_at_ms === "number" && Number.isFinite(event.purchased_at_ms)
      ? new Date(event.purchased_at_ms)
      : null;
  const expirationAt =
    typeof event.expiration_at_ms === "number" && Number.isFinite(event.expiration_at_ms)
      ? new Date(event.expiration_at_ms)
      : null;

  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.map((id) => String(id))
    : event.entitlement_id
      ? [String(event.entitlement_id)]
      : [];

  return {
    eventId,
    eventType,
    appUserId,
    productId: event.product_id ? String(event.product_id) : null,
    entitlementIds,
    transactionId: event.transaction_id ? String(event.transaction_id) : null,
    store: event.store ? String(event.store) : null,
    environment: event.environment ? String(event.environment) : null,
    purchasedAt,
    expirationAt,
    raw: payload,
  };
}

export function resolveWebhookAppUserId(parsed: ParsedRevenueCatWebhook): string | null {
  const candidates = [
    parsed.appUserId,
    ...(parsed.raw.event?.aliases || []),
    parsed.raw.event?.original_app_user_id,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  for (const id of candidates) {
    if (ObjectId.isValid(id)) return id;
  }
  return null;
}
