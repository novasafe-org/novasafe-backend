# Phase 6 — Billing UX Consistency Review

**Date:** 2026-06-07  
**Scope:** `novasafe-app-v2` (account/billing), `novasafe-auth-v2` (/upgrade, /billing/manage)  
**Architecture preserved:** app = account management · auth = checkout + portal redirect

---

## 1. Current State Analysis (Pre-Phase 6)

### Architecture (unchanged)

```
app.novasafe.io/account/billing
  → Display plan, limits, history
  → Links to start.novasafe.io for upgrade & manage

start.novasafe.io/upgrade
  → RevenueCat Web SDK → Paddle checkout

start.novasafe.io/billing/manage
  → RevenueCat managementURL → Paddle portal
```

### Billing page (`app-v2`)

| Area | Pre-Phase 6 behavior | Issue |
|------|----------------------|-------|
| Free user CTAs | Upgrade + Manage + Billing portal + Resubscribe if any purchase existed | Manage/portal shown to never-subscribed free users |
| Pro user CTAs | Upgrade hidden; manage shown | OK |
| Cancelled active | Same as pro + no “Resume” CTA | Missing resume affordance |
| Expired | Upgrade + Resubscribe + manage if purchases | “Resubscribe” duplicate of upgrade; renewal spam in history |
| Billing history | Single list for all users | Free/expired users saw long renewal lists from test data |
| Feature section | Generic “Plan features” | Free users didn’t emphasize limits |

### Upgrade page (`auth-v2` PaywallCard)

| Area | Behavior | Issue |
|------|----------|-------|
| Visual design | PlanToggle + PlanCard + CTA | OK — preserved |
| Pricing | From RC `formattedPrice` | Dynamic — no hardcoded amounts |
| Comparison | Pro feature bullets only | No Free vs Pro table |
| Trust | Single ShieldCheck footer | Could surface encryption earlier |

### Manage page (`auth-v2` /billing/manage)

| Area | Pre-Phase 6 behavior | Issue |
|------|----------------------|-------|
| Success | Open portal in **new tab** + full AuthShell marketing | User expected same-tab redirect |
| Error | Full AuthShell + Title + ErrorBanner | Too heavy for error state |
| Loading | Minimal spinner | OK |

---

## 2. UX Inconsistencies Identified

| ID | Inconsistency | Severity |
|----|---------------|----------|
| U-01 | `shouldShowManageSubscription` true when `purchases.length > 0` even for free tier | High |
| U-02 | Resubscribe shown alongside Upgrade for free users with history | Medium |
| U-03 | No distinct **cancelled-but-active** state (access until + resume) | High |
| U-04 | Expired users see full renewal history | Medium |
| U-05 | Free users see empty/confusing billing history table | Medium |
| U-06 | Manage page uses marketing shell on errors | Low |
| U-07 | Portal opens new tab instead of redirect | Low |
| U-08 | Upgrade page lacks Free vs Pro comparison | Medium |

---

## 3. Required Changes (Implemented)

### Billing page state machine

New `BillingUxState` in `subscription-display.ts`:

| State | Show | Hide |
|-------|------|------|
| **free** | Upgrade to Pro, usage limits | Manage, portal, resubscribe, history |
| **pro** | Plan name, renewal, Manage, Billing portal | Upgrade |
| **cancelled_active** | Access until, Resume, Manage, portal | Upgrade |
| **expired** | “Upgrade again”, past history (no renewals) | Manage/portal unless prior purchases |

### Billing history

- **Free:** hidden; friendly empty copy
- **Expired:** “Past subscription” — renewals filtered out
- **Pro / cancelled:** “Active subscription” + “Earlier activity” sections

### Upgrade page

- Added `PlanComparison` — Free vs Pro table + trust line
- No layout redesign; inserted above plan toggle

### Manage page

- Compact card shell (no AuthShell marketing on errors)
- Loading → **same-tab redirect** via `window.location.assign(portalUrl)`
- Compact error + “Return to the app” CTA

### Regional pricing

- Verified pipeline uses RC/Paddle only (see §5)
- Removed `USD` fallback in yearly-per-month formatter when currency missing

---

## 4. Screens Impacted

| Screen | URL | Project |
|--------|-----|---------|
| Billing | `/account/billing` | app-v2 |
| Profile (upgrade link unchanged) | `/account/profile` | app-v2 |
| Upgrade | `/upgrade` | auth-v2 |
| Signup Pro | `/signup/pro` | auth-v2 (inherits PaywallCard) |
| Manage subscription | `/billing/manage` | auth-v2 |

---

## 5. Components Impacted

### app-v2

| File | Change |
|------|--------|
| `src/lib/billing/subscription-display.ts` | `BillingUxState`, `getBillingPageActions`, `partitionBillingHistory` |
| `src/lib/billing/subscription-display.test.ts` | Unit tests for state machine |
| `src/components/billing/BillingPageView.tsx` | State-driven CTAs + history sections |
| `src/routes/_app.account.billing.tsx` | Simplified props |

### auth-v2

| File | Change |
|------|--------|
| `src/components/auth/paywall/PlanComparison.tsx` | **New** — Free vs Pro |
| `src/components/auth/paywall/PaywallCard.tsx` | Renders PlanComparison |
| `src/routes/billing.manage.tsx` | Compact shell, auto-redirect |
| `src/lib/billing/client.ts` | No USD fallback in price formatter |

---

## 6. Regional Pricing Audit

### Price pipeline

```
RevenueCat Dashboard (Offering)
  → Package ($rc_monthly / $rc_annual or configured IDs)
    → webBillingProduct (Paddle product)
      → price.formattedPrice  ← displayed on PlanCard
      → price.currency        ← metadata only
      → defaultSubscriptionOption.base.pricePerMonth.formattedPrice  ← yearly equiv.
```

### Answers

| Question | Finding |
|----------|---------|
| Hardcoded prices on upgrade page? | **No** — `PlanCard` uses `plan.priceLabel` from SDK |
| Reading from RevenueCat? | **Yes** — `billingClient.loadOfferings()` → `pickPlan()` |
| Paddle localization ignored? | **No** — RC Web SDK returns locale-formatted `formattedPrice` based on browser/geo |
| Currency from user location? | **Yes** — determined by Paddle via RC SDK (not app code) |
| Always USD? | **No** — only fallback removed was manual `Intl` formatter defaulting to USD when `currency` missing |

### Configuration reference

| Setting | Source | Values |
|---------|--------|--------|
| Offering ID | RC dashboard `current` offering | Runtime from `offerings.current.identifier` |
| Monthly package candidates | `billing.config.ts` | `$rc_monthly`, `novasafe_pro_monthly`, env override |
| Yearly package candidates | `billing.config.ts` | `$rc_annual`, `novasafe_pro_yearly`, env override |
| Entitlement | `VITE_REVENUECAT_ENTITLEMENT_PRO` | `pro` |
| Web public key | `VITE_REVENUECAT_PUBLIC_API_KEY_WEB` | `pdl_…` (Paddle via RC) |

### Hardcoded prices found

| Location | Hardcoded? |
|----------|------------|
| `PaywallCard.tsx` | No — uses `plan.priceLabel` |
| `PlanCard.tsx` | No — displays dynamic `priceLabel` |
| `client.ts` `pickPlan()` | No — uses `price.formattedPrice` |
| `client.ts` `formatYearlyAsMonthly()` | Was USD fallback — **fixed** to skip if no currency |
| `subscription-display.ts` | No monetary amounts |
| `BillingPageView.tsx` | No monetary amounts |

### Expected localized display

| Region | Source | Example display |
|--------|--------|-----------------|
| India | Paddle localization via RC | `₹299/month`, `₹2,499/year` |
| United States | Paddle | `$4.99/month`, `$49.99/year` |
| UK | Paddle | `£4.99/month` |
| EU | Paddle | `€4.99/month` |
| Other | Paddle default for country | Provider-returned currency |

**Validation:** Confirm in browser with VPN or regional device — prices must match RevenueCat offering preview for that country. App code does not override locale.

### Currency conversion issues

- None in display path — app never converts currencies
- Backend stores `productId` / subscription state only — no price amounts in MongoDB for web display

---

## 7. Test Plan

| Scenario | Expected UI |
|----------|-------------|
| Free, no purchases | Upgrade only; no history; limits section |
| Pro active | Manage + portal; renewal date; no upgrade |
| Cancelled, still active | Resume + manage; access until date |
| Expired with history | Upgrade again; past subscription history (no renewals) |
| Upgrade page India | INR prices from RC/Paddle on PlanCard |
| Manage with portal | Loading → redirect to portal same tab |
| Manage no portal | Compact error + return CTA |

### Automated tests

```bash
cd v2/novasafe-app-v2 && npm run test
```

`subscription-display.test.ts` — 6 tests for billing UX state machine.

---

## 8. Out of Scope (Preserved)

- RevenueCat SDK integration
- Paddle checkout modal
- Offering / product configuration
- Backend subscription APIs
- Checkout flow steps
- Auth architecture split

---

## 9. Deployment Notes

1. **app-v2** — deploy for billing state UX + history partitioning  
2. **auth-v2** — deploy for PlanComparison + manage redirect + pricing formatter fix  
3. Ensure `VITE_REVENUECAT_PUBLIC_API_KEY_WEB` is set in auth production build for upgrade/manage to function
