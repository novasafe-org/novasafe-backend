import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ObjectId } from "mongodb";
import { parseRevenueCatWebhookBody, resolveWebhookAppUserId } from "./revenueCatWebhookParser";

describe("revenueCatWebhookParser", () => {
  const userId = new ObjectId().toString();

  it("parses renewal payload", () => {
    const parsed = parseRevenueCatWebhookBody({
      api_version: "1.0",
      event: {
        id: "evt-renewal-1",
        type: "RENEWAL",
        app_user_id: userId,
        product_id: "novasafe_pro_monthly",
        entitlement_ids: ["pro"],
        transaction_id: "txn-123",
        purchased_at_ms: 1_700_000_000_000,
        expiration_at_ms: 1_700_086_400_000,
        store: "PLAY_STORE",
        environment: "SANDBOX",
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.eventType, "RENEWAL");
    assert.equal(parsed?.appUserId, userId);
    assert.equal(parsed?.productId, "novasafe_pro_monthly");
    assert.equal(parsed?.transactionId, "txn-123");
  });

  it("resolves valid Mongo user id from aliases", () => {
    const parsed = parseRevenueCatWebhookBody({
      event: {
        id: "evt-2",
        type: "EXPIRATION",
        app_user_id: "invalid",
        aliases: [userId],
      },
    });
    assert.ok(parsed);
    assert.equal(resolveWebhookAppUserId(parsed!), userId);
  });

  it("returns null for malformed payload", () => {
    assert.equal(parseRevenueCatWebhookBody(null), null);
    assert.equal(parseRevenueCatWebhookBody({}), null);
  });
});
