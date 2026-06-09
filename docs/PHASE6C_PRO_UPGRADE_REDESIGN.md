# Phase 6C — Pro Upgrade Page Redesign

**Route:** `start.novasafe.io/pro`  
**Date:** 2026-05-30

---

## 1. Existing page analysis (before 6C)

| Aspect | Before |
|--------|--------|
| Layout | Single narrow column (`max-w-lg`) |
| Structure | Title → bullet list → pill toggle → single plan card → CTA |
| Feel | Lightweight checkout, but still stacked like a landing form |
| Plan selection | Segmented toggle + one visible plan card |
| Pricing source | RevenueCat `price.formattedPrice` (correct) |
| India USD issue | INR not configured in RC/Paddle dashboard; code requests INR only when provider returns it |
| Purchase error | RC `PurchaseInvalidError` (code 4) — caused by invalid `purchase()` params (`skipSuccessPage`, stale package cache) |

---

## 2. New layout architecture

```
CheckoutShell (max-width 1200px, dark theme)
└── ProUpgradeCheckout
    ├── LEFT 45% — Plan selection
    │   ├── Title + subtitle
    │   ├── Plan option cards (Monthly / Yearly)
    │   └── Feature list (8 items)
    └── RIGHT 55% — Checkout summary (sticky on desktop)
        ├── Summary card (plan, price, billing, currency)
        ├── Trust lines
        ├── Error / pending notices
        ├── Primary CTA → billingClient.purchase()
        └── Return link
```

**Desktop:** `lg:grid-cols-[45fr_55fr]`  
**Tablet / mobile:** Single column — title → plan cards → features → summary → CTA

---

## 3. Component map

| Component | Role |
|-----------|------|
| `CheckoutShell.tsx` | Page chrome — logo, theme toggle, back link, 1200px container |
| `ProUpgradeCheckout.tsx` | 6C two-column UI |
| `useProCheckout.ts` | Offerings load, cycle state, purchase + confirm (unchanged logic) |
| `client.ts` | RevenueCat wrapper — offerings fetch, purchase, currency fallback |
| `locale-currency.ts` | Region/timezone → currency hint |
| `pro.tsx` | Route — renders `ProUpgradeCheckout` |
| `PaywallCard.tsx` | Unchanged for `/signup/pro` marketing flow |

---

## 4. Pricing source verification

| Display | Source |
|---------|--------|
| Plan card price | `webBillingProduct.price.formattedPrice` |
| Currency code | `price.currency` |
| Per-month subline (yearly) | `pricePerMonth.formattedPrice` or `Intl` fallback |
| Savings % | Computed from `amountMicros` on monthly × 12 vs yearly |
| Hardcoded `$49.99` / `₹299` | **None** |

**Flow:**

```
resolveOfferingsCurrency() → getOfferings({ currency? })
  → if provider returns matching currency, use it
  → else fall back to geo/default (no currency param)
  → pickPlan() → UI
```

**India → ₹:** Requires INR price on Paddle products in RevenueCat dashboard. App cannot invent INR amounts.

---

## 5. Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| `lg+` | Two columns, summary sticky |
| `sm–lg` | Plan cards side-by-side in left section; summary below |
| `<sm` | Full stack: title → plans → features → summary → CTA |

---

## 6. Purchase fix (error code 4)

**Symptom:** "One or more of the arguments provided are invalid."

**Cause:** RevenueCat `PurchaseInvalidError` from invalid `purchase()` parameters.

**Fixes:**
- Removed `skipSuccessPage` (unsupported / invalid for Paddle flow)
- Fresh offering fetch on each purchase (no stale cached package)
- Locale sanitized to valid BCP47 (`en`, `en-IN`)
- `htmlTarget` only passed when element is connected and has height

---

## 7. Preserved functionality

- RevenueCat `configure`, `getOfferings`, `purchase`
- Paddle embedded checkout
- `next` / `ref` query params
- `upgraded=1` return to app billing
- Entitlement confirm + webhook sync
- `/upgrade` → `/pro` redirect

---

## 8. Verification checklist

- [ ] `/pro` shows two-column layout on desktop
- [ ] Monthly / yearly cards switch selection and summary price
- [ ] Prices from RC (no hardcoded values)
- [ ] Monthly purchase completes
- [ ] Yearly purchase completes
- [ ] Return to `app/account/billing?upgraded=1` after success
