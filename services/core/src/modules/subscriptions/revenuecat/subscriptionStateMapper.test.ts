import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapRevenueCatSubscriberToState } from "./subscriptionStateMapper";
import type { RevenueCatSubscriberResponse } from "../services/revenue-cat.service";

describe("subscriptionStateMapper lifecycle", () => {
  it("Scenario A: activation maps active pro entitlement", () => {
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
            store: "paddle",
            unsubscribe_detected_at: null,
            billing_issues_detected_at: null,
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "INITIAL_PURCHASE" });
    assert.equal(state.tier, "pro");
    assert.equal(state.isPro, true);
    assert.equal(state.isActive, true);
    assert.equal(state.subscriptionStatus, "active");
    assert.equal(state.entitlements.canUsePasswordHistory, true);
  });

  it("Scenario B: renewal keeps active pro subscription", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
            store: "paddle",
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "RENEWAL" });
    assert.equal(state.tier, "pro");
    assert.equal(state.isActive, true);
    assert.equal(state.subscriptionStatus, "active");
    assert.ok(state.lastRenewalAt);
  });

  it("Scenario C: cancellation remains active until expiry", () => {
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
            store: "paddle",
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

  it("Scenario D: expiration downgrades to free", () => {
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
            store: "paddle",
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "EXPIRATION" });
    assert.equal(state.tier, "free");
    assert.equal(state.isPro, false);
    assert.equal(state.isActive, false);
    assert.equal(state.subscriptionStatus, "inactive");
    assert.equal(state.entitlements.canUsePasswordHistory, false);
  });

  it("Scenario E: refund removes entitlements when RC shows expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const rc: RevenueCatSubscriberResponse = {
      subscriber: {
        entitlements: {},
        subscriptions: {
          novasafe_pro_monthly: {
            expires_date: past,
            store: "paddle",
          },
        },
      },
    };
    const state = mapRevenueCatSubscriberToState(rc, { lastEventType: "CANCELLATION" });
    assert.equal(state.tier, "free");
    assert.equal(state.isActive, false);
    assert.equal(state.entitlements.canUsePasswordHistory, false);
  });
});
