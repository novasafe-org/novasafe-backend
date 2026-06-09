# Localized Pricing Audit — Phase 6A

**Date:** 2026-05-30  
**Scope:** RevenueCat Web SDK → Offering → Package → Paddle Product → Upgrade UI (`start.novasafe.io/upgrade`)

---

## Flow trace

```
Browser (novasafe-auth-v2)
  └─ billingClient.loadOfferings(appUserId)
       └─ Purchases.configure({ apiKey, appUserId })
       └─ resolveOfferingsCurrency()  ← browser locale / timezone
       └─ purchases.getOfferings({ currency? })
            └─ RevenueCat current offering
                 └─ Package ($rc_monthly / $rc_annual or env overrides)
                      └─ webBillingProduct.price.formattedPrice
                      └─ defaultSubscriptionOption.base.pricePerMonth.formattedPrice
                           └─ PaywallCard → PlanCard UI
```

Purchase path reuses the same package object and passes `selectedLocale` from `navigator.language` into `purchases.purchase()`.

---

## RevenueCat configuration (env)

| Setting | Default / source |
|---------|------------------|
| Public API key | `VITE_REVENUECAT_PUBLIC_API_KEY_WEB` |
| Pro entitlement | `VITE_REVENUECAT_ENTITLEMENT_PRO` → `pro` |
| Monthly package candidates | `VITE_REVENUECAT_PACKAGE_MONTHLY` → `$rc_monthly`, `novasafe_pro_monthly`, `monthly` |
| Yearly package candidates | `VITE_REVENUECAT_PACKAGE_YEARLY` → `$rc_annual`, `novasafe_pro_yearly`, `yearly`, `annual` |
| Offering ID | Runtime from `offerings.current.identifier` (not hardcoded in app) |

---

## Package IDs and price source

| Cycle | RC package resolution | Price fields used |
|-------|----------------------|-------------------|
| Monthly | `offering.monthly` → env candidates → fuzzy `month` match | `product.price.formattedPrice`, `product.price.currency` |
| Yearly | `offering.annual` → env candidates → fuzzy `year`/`annual` match | `product.price.formattedPrice`, `pricePerMonth.formattedPrice` (preferred for “/month” subline) |

**UI mapping** (`client.ts` → `pickPlan()`):

- `priceLabel` ← `price.formattedPrice` (provider string, not computed in UI)
- `effectiveMonthlyLabel` ← `pricePerMonth.formattedPrice` or `formatYearlyAsMonthly(price)` using `price.currency` + browser locale
- `currencyCode` ← `price.currency`

There is **no** `package.priceString` in the Web SDK; the equivalent is `webBillingProduct.price.formattedPrice`.

---

## Hardcoded price audit

| Check | Result |
|-------|--------|
| `$49.99` in auth-v2 upgrade flow | **Not hardcoded** |
| `$4.10/month` in auth-v2 upgrade flow | **Not hardcoded** |
| Currency symbol in PlanCard | **Not hardcoded** — renders `plan.priceLabel` from RC |
| Landing marketing page (`novasafe-landing-v2/Pricing.tsx`) | Contains static `$49.99` / `$4.16/mo` for marketing only — **out of upgrade checkout scope** |

Observed production values (`$49.99`, `$4.10/month`) match Paddle’s USD annual list price ÷ 12, meaning the **provider returned USD**, not that the app injected those strings.

---

## Currency / localization behavior

| Layer | Behavior |
|-------|----------|
| RevenueCat `getOfferings()` | Supports `currency` ISO 4217 param; without it, RC attempts IP geolocation then app default currency |
| Paddle | Localizes at checkout via geolocation and product price overrides when enabled in Paddle dashboard |
| App (before fix) | Called `getOfferings()` with **no** `currency` and legacy `configure(apiKey, userId)` |
| Geolocation in app | **Not implemented** before Phase 6A |

### Why India showed USD

1. RC geolocation can fall back to the app **default currency (USD)** when INR is not configured on the Paddle price, or when geo is inconclusive (VPN, corporate network, SSR timing).
2. The app did not pass an explicit `currency: "INR"` hint from the browser locale (`en-IN`) or timezone (`Asia/Kolkata`).
3. Display strings were already provider-sourced; the bug was **currency selection**, not UI hardcoding.

---

## Fix implemented (Phase 6A)

**File:** `novasafe-auth-v2/src/lib/billing/locale-currency.ts`

- `resolveOfferingsCurrency()` maps browser locale region (`en-IN` → `INR`) and timezone (`Asia/Kolkata` → `INR`) to ISO 4217 codes.
- Supported regions include IN→INR, US→USD, GB→GBP, EU member states→EUR, plus common markets (AU, CA, SG, …).

**File:** `novasafe-auth-v2/src/lib/billing/client.ts`

- `getOfferings({ currency })` when locale resolves a currency.
- `Purchases.configure({ apiKey, appUserId })` (modern config object).
- `purchase({ selectedLocale, defaultLocale })` from `navigator.language`.
- `formatYearlyAsMonthly()` uses browser locale for `Intl.NumberFormat`.

### Expected outcomes

| Region | Currency hint | Display source |
|--------|---------------|----------------|
| India | `INR` | RC/Paddle `formattedPrice` in ₹ |
| United States | `USD` | `$` from provider |
| Eurozone | `EUR` | `€` from provider |
| United Kingdom | `GBP` | `£` from provider |

### Dashboard prerequisites (not changed in code)

If INR still appears as USD after this fix, verify in **Paddle** that automatic currency conversion or INR price overrides are enabled for the NovaSafe Pro products linked in RevenueCat. The app cannot invent INR amounts if Paddle/RC only publish USD for that product.

---

## Verification checklist

- [ ] Open `/upgrade` with browser locale `en-IN` or timezone `Asia/Kolkata` → yearly card shows ₹ (not `$49.99`).
- [ ] US locale → USD.
- [ ] UK locale → GBP.
- [ ] DE/FR locale → EUR.
- [ ] Checkout modal still completes purchase (no flow changes).
- [ ] `currencyCode` on offerings reflects provider response.
