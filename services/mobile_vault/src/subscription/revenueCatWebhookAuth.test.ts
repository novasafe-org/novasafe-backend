import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  normalizeRevenueCatWebhookAuth,
  verifyRevenueCatWebhookAuth,
} from "./revenueCatWebhookAuth";

describe("revenueCatWebhookAuth", () => {
  const originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });

  it("strips Bearer prefix from authorization header", () => {
    assert.equal(normalizeRevenueCatWebhookAuth("Bearer my-secret"), "my-secret");
    assert.equal(normalizeRevenueCatWebhookAuth("my-secret"), "my-secret");
  });

  it("rejects when webhook secret is missing", () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    const result = verifyRevenueCatWebhookAuth("anything");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });

  it("accepts valid authorization", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "test-webhook-secret";
    const result = verifyRevenueCatWebhookAuth("Bearer test-webhook-secret");
    assert.equal(result.ok, true);
  });

  it("rejects invalid authorization", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "test-webhook-secret";
    const result = verifyRevenueCatWebhookAuth("Bearer wrong");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });
});
