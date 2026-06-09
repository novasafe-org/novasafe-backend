# Paddle Checkout Error 7878 — Fix Guide

**Symptom:** Clicking "Start NovaSafe Pro" on `start.novasafe.io/pro` fails immediately.

- Network: `POST https://api.revenuecat.com/rcbilling/v1/checkout/start` → **422**
- Response: `{ "code": 7878, "message": "The purchase could not be completed." }`
- UI: "One or more of the arguments provided are invalid."

**What 7878 means:** RevenueCat (`BackendPurchaseCannotBeCompleted`) could not create a Paddle checkout session. Paddle never opens — this is **not** a card/payment failure.

---

## What your screenshots already confirm ✅

| Item | Status |
|------|--------|
| Paddle products (Monthly ₹149.99, Yearly ₹999) | ✅ Active |
| RevenueCat Paddle app connected | ✅ Connected |
| Products imported to RC (`pri_01ktep…`) | ✅ Published |
| Offering `default` with `$rc_monthly` / `$rc_annual` | ✅ Linked |
| Entitlement attached to Paddle products | ✅ |
| Webhooks active | ✅ Last received recently |

Catalog and RC↔Paddle linkage look correct. The failure is almost always **Paddle account setup** for embedded Web SDK checkout.

---

## Required Paddle dashboard steps (most common miss)

Do these in **production** Paddle (`https://vendors.paddle.com/`), not sandbox.

### 1. Register payment domains

**Checkout → Website approval → Add domain**

Add **both**:

1. `pay.rev.cat` (required by RevenueCat)
2. `start.novasafe.io` (required because checkout runs on your domain via Web SDK)

Submit each for approval. **Production domains must be approved by Paddle** before checkout works. Sandbox auto-approves; production does not.

### 2. Default payment link

**Checkout → Checkout settings → Default payment link**

If empty, set: `https://pay.rev.cat`

(If you already use another approved domain for other products, you can leave it — but `pay.rev.cat` must still be in approved domains.)

### 3. API key permissions

**Developer tools → Authentication → your RevenueCat API key**

Minimum permissions per [RevenueCat Paddle docs](https://www.revenuecat.com/docs/web/integrations/paddle):

| Permission | Read | Write |
|------------|------|-------|
| Client-side tokens | ☑ | **☑** |
| Customer portal sessions | | **☑** |
| Transactions | ☑ | **☑** |
| Products, Prices, Subscriptions, Customers | ☑ | |

Also: set key to **Never expires** (default Paddle keys expire).

After changing permissions, paste the key again in **RevenueCat → Web → NovaSafe (Paddle) → Set secret → Connect**.

### 4. Disable abandoned cart emails

**Checkout → Notification settings** — disable abandoned cart emails (RC Paddle integration does not support them).

---

## INR pricing vs USD display (separate issue)

Console log:

```
[billing] INR not available from provider (got USD); using geo/default
```

- India is detected (`Asia/Kolkata` / `IN`).
- RevenueCat offerings API still returns **USD** (`$49.99` / `$3.99`).
- Paddle dashboard shows **INR base prices** — correct on Paddle side.
- RevenueCat's offerings layer does not expose INR for these Paddle prices yet.

**Impact:** Display may show USD; Paddle checkout may still localize at payment time once checkout starts.

**To fix display:** In Paddle, verify country-specific prices for India are active on each price. Re-import products in RevenueCat after changes. If RC still returns USD, contact RevenueCat support — this is an RC↔Paddle offerings limitation, not app code.

---

## Entitlement identifier note

RevenueCat dashboard entitlement: **`NovaSafe Pro`**

App/backend env default: **`pro`**

Backend entitlement resolver scans all active entitlements, so purchases still grant Pro after checkout succeeds. For consistency, align `VITE_REVENUECAT_ENTITLEMENT_PRO` / `REVENUECAT_ENTITLEMENT_PRO` with the RC identifier if you rename it.

---

## Verification checklist

After Paddle domain approval (can take 24–48h):

1. Open `start.novasafe.io/pro` (hard refresh / incognito).
2. DevTools → Network → click "Start NovaSafe Pro".
3. `checkout/start` should return **200** with `operation_session_id` and `paddle_billing_params`.
4. Paddle checkout overlay should open (not instant 422).

If `checkout/start` still returns 7878 after domains are approved:

- Re-create Paddle API key with full permissions and reconnect in RC.
- Check RevenueCat **Customers** for your email — expired/canceled state may block re-purchase; wait or contact Paddle support.
- Email RevenueCat support with: project ID, app user ID, `trace_id` from failed request, error code 7878.

---

## Code reference

Purchase flow: `v2/novasafe-auth-v2/src/lib/billing/client.ts`

RC public key env: `VITE_REVENUECAT_PUBLIC_API_KEY_WEB` (must be the **RevenueCat Web → NovaSafe (Paddle) → Public API key**, `pdl_…` prefix is correct for Paddle provider).
