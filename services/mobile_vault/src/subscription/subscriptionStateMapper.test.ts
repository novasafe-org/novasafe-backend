import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapRevenueCatSubscriberToState } from "./subscriptionStateMapper";
import type { RevenueCatSubscriberResponse } from "../services/revenueCatService";

describe("subscriptionStateMapper", () => {
  it("maps active pro entitlement", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const rc: RevenueCatSubscriberResponse = {
      subscriber: {
        entitlements: {
          pro: {
            expires_date: future,
            product_identifier: "novasafe_pro_monthly",
            purchase_date: new Date().toISOString(),
          },
        },
        subscriptions: {
          novasafe_pro_monthly: {
            expires_date: future,
            store: "play_store",
            unsubscribe_detected_at: null,
            billing_issues_detected_at: null,
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "RENEWAL" });
    assert.equal(state.tier, "pro");
    assert.equal(state.isPro, true);
    assert.equal(state.isActive, true);
    assert.equal(state.subscriptionStatus, "active");
    assert.equal(state.entitlements.canUseCloudSync, true);
    assert.ok(state.lastRenewalAt);
  });

  it("downgrades expired entitlement to free", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const rc: RevenueCatSubscriberResponse = {
      subscriber: {
        entitlements: {
          pro: {
            expires_date: past,
            product_identifier: "novasafe_pro_monthly",
          },
        },
        subscriptions: {
          novasafe_pro_monthly: {
            expires_date: past,
            store: "play_store",
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "EXPIRATION" });
    assert.equal(state.tier, "free");
    assert.equal(state.isPro, false);
    assert.equal(state.isActive, false);
    assert.equal(state.subscriptionStatus, "expired");
    assert.equal(state.entitlements.canUseUnlimitedPasswords, false);
  });

  it("marks cancelled-but-active subscription status", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const cancelledAt = new Date().toISOString();
    const rc: RevenueCatSubscriberResponse = {
      subscriber: {
        entitlements: {
          pro: { expires_date: future, product_identifier: "novasafe_pro_yearly" },
        },
        subscriptions: {
          novasafe_pro_yearly: {
            expires_date: future,
            unsubscribe_detected_at: cancelledAt,
            store: "app_store",
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "CANCELLATION" });
    assert.equal(state.tier, "pro");
    assert.equal(state.isActive, true);
    assert.equal(state.subscriptionStatus, "cancelled");
    assert.equal(state.autoRenewing, false);
    assert.equal(state.cancellationAt, cancelledAt);
  });
});
