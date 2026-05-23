import crypto from "crypto";
import { SUBSCRIPTION_CONFIG } from "../config/subscription.config";

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function normalizeRevenueCatWebhookAuth(header: string | undefined): string {
  const raw = String(header || "").trim();
  if (raw.toLowerCase().startsWith("bearer ")) return raw.slice(7).trim();
  return raw;
}

function readWebhookSecret(): string {
  return String(process.env.REVENUECAT_WEBHOOK_SECRET || SUBSCRIPTION_CONFIG.webhookSecret || "").trim();
}

export function isWebhookSecretConfigured(): boolean {
  return Boolean(readWebhookSecret());
}

/** Validates RevenueCat Authorization header against REVENUECAT_WEBHOOK_SECRET. */
export function verifyRevenueCatWebhookAuth(authorizationHeader: string | undefined): WebhookAuthResult {
  const secret = readWebhookSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: "Webhook secret not configured (set REVENUECAT_WEBHOOK_SECRET)",
    };
  }

  const providedRaw = normalizeRevenueCatWebhookAuth(authorizationHeader);
  if (!providedRaw) {
    return { ok: false, status: 401, message: "Missing Authorization header" };
  }

  const provided = Buffer.from(providedRaw, "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (provided.length !== expected.length) {
    return { ok: false, status: 401, message: "Invalid webhook authorization" };
  }

  const valid = crypto.timingSafeEqual(provided, expected);
  if (!valid) {
    return { ok: false, status: 401, message: "Invalid webhook authorization" };
  }

  return { ok: true };
}
