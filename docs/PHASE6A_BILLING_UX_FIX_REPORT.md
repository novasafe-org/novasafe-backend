# Phase 6A — Billing UX + Localized Pricing Fix Report

**Date:** 2026-05-30  
**Repos touched:** `v2/novasafe-auth-v2`, `v2/novasafe-app-v2`  
**Preserved:** RevenueCat offerings/packages, Paddle products, checkout flow, webhooks, entitlements

---

## 1. Root cause of USD pricing (India)

**Finding:** Upgrade UI prices are **not hardcoded**. `PlanCard` renders `plan.priceLabel` from RevenueCat’s `webBillingProduct.price.formattedPrice`.

India showed `$49.99` / `$4.10/month` because:

1. `getOfferings()` was called **without** the `currency` parameter, relying solely on RC server-side geolocation.
2. Geolocation or Paddle product configuration fell back to the **default USD** price for the linked annual product.
3. No client-side locale/timezone hint (`en-IN`, `Asia/Kolkata` → `INR`) was sent to RevenueCat.

**Fix:** Added `locale-currency.ts` and pass `currency` into `getOfferings()`, plus `selectedLocale` on `purchase()`. See [LOCALIZED_PRICING_AUDIT.md](./LOCALIZED_PRICING_AUDIT.md).

---

## 2. RevenueCat / Paddle audit findings

| Item | Status |
|------|--------|
| Hardcoded `$49.99` in checkout UI | None |
| `package.priceString` | Not in Web SDK; use `price.formattedPrice` ✓ already used |
| Currency symbol hardcoded | No — provider `formattedPrice` includes symbol |
| RC returning localized pricing | Yes, when `currency` param + Paddle INR/EUR/GBP config align |
| Paddle localization ignored | Not ignored at checkout; **offerings fetch** lacked currency hint |
| Geolocation in app | Added via browser locale + timezone mapping |
| Offering IDs | Runtime `offerings.current` (env package candidates: `$rc_monthly`, `$rc_annual`) |

---

## 3. Billing portal UX improvements

**Route:** `start.novasafe.io/billing/manage`  
**File:** `novasafe-auth-v2/src/routes/billing.manage.tsx`

| Before | After |
|--------|-------|
| Short `min-h-[50vh]` strip, light card on empty white page | Full `min-h-screen` NovaSafe shell with logo |
| Generic error copy | Branded error card with “Possible reasons” list |
| Single “Return to the app” | **Return to billing** + **Contact support** (`support@novasafe.app`) |
| Loading: “Opening billing portal…” | Loading: “Opening your billing portal…” with spinner in branded card |
| Light theme by default | Dark NovaSafe theme applied for this route |

Auto-redirect when `managementURL` exists is unchanged.

---

## 4. Upgrade page layout improvements

**Files:** `AuthShell.tsx`, `PaywallCard.tsx`, `PlanToggle.tsx`, `PlanCard.tsx`

| Change | Detail |
|--------|--------|
| Column ratio | `lg:grid-cols-[11fr_9fr]` (~55% / 45%) |
| Checkout width | `max-w-[520px]` (was 440px) |
| Visual hierarchy | Headline → comparison → full-width toggle → dominant pricing card → CTA → trust box |
| Toggle / trust alignment | `PlanToggle fullWidth`; trust + Paddle line span card width |
| Pricing card | Larger price type (`32px`), stronger border/shadow |

No design-system tokens or color palette changes.

---

## 5. Billing state logic corrections

**File:** `novasafe-app-v2/src/lib/billing/subscription-display.ts`

**Bug:** Expired users with purchase history saw **Manage subscription** and **Billing portal** because `showManage` / `showBillingPortal` were tied to `purchases.length > 0`.

**Rule applied:**

| State | CTAs |
|-------|------|
| Free | Upgrade only |
| Expired | Upgrade again only |
| Cancelled active | Resume + Manage + Billing portal |
| Pro active | Manage + Billing portal |

Expired users no longer see manage/portal links (management URL is typically null after expiry; app cannot call RC SDK to verify URL server-side).

**Tests updated:** `subscription-display.test.ts` asserts expired + history still hides manage/portal.

---

## Build verification

```bash
cd v2/novasafe-auth-v2 && npm run build
cd v2/novasafe-app-v2 && npm run build
```

---

## Manual test plan

1. **Localized pricing** — `/upgrade` from India locale → INR on plan card; US → USD.
2. **Checkout** — Complete purchase; webhook/entitlement unchanged.
3. **Billing portal** — Active subscriber → auto-redirect; expired → branded error, no white page.
4. **App billing** — Expired account → only “Upgrade again”; active Pro → manage links.
5. **Layout** — Desktop 55/45 balance; mobile unchanged responsiveness.

---

## Related docs

- [LOCALIZED_PRICING_AUDIT.md](./LOCALIZED_PRICING_AUDIT.md)
- [BILLING_UX_REVIEW.md](./BILLING_UX_REVIEW.md) (Phase 6)
