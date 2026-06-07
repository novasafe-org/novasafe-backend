import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveWebhookClaimOutcome,
  STALE_PROCESSING_MS,
  isTerminalWebhookStatus,
} from "./webhook-idempotency";

describe("resolveWebhookClaimOutcome", () => {
  const now = Date.now();

  it("returns new when no prior event exists", () => {
    assert.equal(resolveWebhookClaimOutcome(null, now), "new");
  });

  it("returns duplicate for completed events", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        { status: "completed", processedAt: new Date(now), createdAt: new Date(now) },
        now,
      ),
      "duplicate",
    );
  });

  it("returns duplicate for ignored events", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        { status: "ignored", processedAt: new Date(now), createdAt: new Date(now) },
        now,
      ),
      "duplicate",
    );
  });

  it("returns retry for failed events (RevenueCat retry path)", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        { status: "failed", processedAt: new Date(now - 1000), createdAt: new Date(now - 2000) },
        now,
      ),
      "retry",
    );
  });

  it("returns duplicate for in-flight processing within stale window", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        {
          status: "processing",
          processedAt: new Date(now - STALE_PROCESSING_MS + 1000),
          createdAt: new Date(now - STALE_PROCESSING_MS),
        },
        now,
      ),
      "duplicate",
    );
  });

  it("returns retry for stale processing claims", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        {
          status: "processing",
          processedAt: new Date(now - STALE_PROCESSING_MS - 1000),
          createdAt: new Date(now - STALE_PROCESSING_MS - 2000),
        },
        now,
      ),
      "retry",
    );
  });

  it("uses createdAt when processedAt is missing for stale check", () => {
    assert.equal(
      resolveWebhookClaimOutcome(
        {
          status: "processing",
          processedAt: undefined as unknown as Date,
          createdAt: new Date(now - STALE_PROCESSING_MS - 5000),
        },
        now,
      ),
      "retry",
    );
  });
});

describe("isTerminalWebhookStatus", () => {
  it("marks completed and ignored as terminal", () => {
    assert.equal(isTerminalWebhookStatus("completed"), true);
    assert.equal(isTerminalWebhookStatus("ignored"), true);
    assert.equal(isTerminalWebhookStatus("failed"), false);
    assert.equal(isTerminalWebhookStatus("processing"), false);
  });
});
