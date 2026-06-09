# Phase 6B — Checkout UX Restructure

**Date:** 2026-05-30  
**Goal:** Authenticated upgrade should feel like a SaaS checkout, not a marketing landing page.

---

## Existing flow (before Phase 6B)

```
app.novasafe.io/account/billing
  → "Upgrade to Pro" link
  → start.novasafe.io/upgrade?next=…
  → AuthShell (50/50 split: EditorialPanel + paywall)
  → PaywallCard (marketing copy + Free vs Pro table)
  → RevenueCat purchase → Paddle checkout

Manage subscription:
  → start.novasafe.io/billing/manage
  → Loading or error card on auth domain
  → (if URL exists) Paddle portal
```

**Problems:**

- Logged-in users saw a split-screen marketing layout with dashboard mockups.
- `/billing/manage` showed a standalone error page when `managementURL` was null.
- `/upgrade` URL implied a funnel step, not checkout.

---

## Proposed flow (implemented)

```
app.novasafe.io/account/billing
  ├── Current plan, history, CTAs (unchanged)
  ├── Upgrade → start.novasafe.io/pro?next=…
  └── Manage → start.novasafe.io/billing/manage (transient)

start.novasafe.io/pro
  → CheckoutShell (centered, single column)
  → PaywallCard variant="checkout"
  → RevenueCat → Paddle (unchanged)

start.novasafe.io/upgrade
  → 302-style redirect to /pro (legacy bookmarks)

start.novasafe.io/billing/manage
  → Brief loading spinner only
  → If managementURL → Paddle portal
  → If unavailable → app.novasafe.io/account/billing?portalError=1
       → toast: "Subscription management is not available. Please contact support."
```

---

## Routes

| Route | Service | Role |
|-------|---------|------|
| `/account/billing` | app-v2 | Billing home — plan, history, CTAs |
| `/pro` | auth-v2 | **Primary** authenticated checkout |
| `/upgrade` | auth-v2 | Legacy alias → redirects to `/pro` |
| `/billing/manage` | auth-v2 | Transient redirect to Paddle or back to app |
| `/signup/pro` | auth-v2 | New-user signup paywall (still uses AuthShell) |

---

## Components affected

| Component | Change |
|-----------|--------|
| `CheckoutShell.tsx` | **New** — centered checkout layout, logo, back link |
| `routes/pro.tsx` | **New** — main upgrade checkout route |
| `routes/upgrade.tsx` | Redirect only → `/pro` |
| `PaywallCard.tsx` | `variant="checkout"` — compact headline + feature list, no comparison table |
| `AuthShell.tsx` | Unchanged — still used by login, signup, `/signup/pro` |
| `billing.manage.tsx` | Loading-only shell; errors redirect to app with `portalError=1` |
| `_app.account.billing.tsx` | Handles `portalError` search param → Sonner toast |
| `auth.config.ts` (both) | Added `AUTH_PATH.Pro = "/pro"` |
| `routes.config.ts` (both) | `buildProUrl()`; `buildUpgradeUrl()` aliases to `/pro` |
| `auth-guard.ts` | `no-subscription` manage gate → app billing + `portalError=1` |

---

## Redirects

| Trigger | Destination |
|---------|-------------|
| Guest hits `/pro` | `/login?next=/pro?…` |
| Already Pro hits `/pro` | `next` URL (app) |
| Legacy `/upgrade` | `/pro` (same query) |
| Manage: no `managementURL` | `app/account/billing?portalError=1` |
| Manage: no subscription history (server gate) | `app/account/billing?portalError=1` |
| Manage: success | Paddle `managementURL` |
| Checkout success | `next` with `upgraded=1` |

---

## Preserved (unchanged)

- RevenueCat `configure`, `getOfferings`, `purchase`
- Paddle checkout modal
- Webhooks and entitlements
- Billing page state logic (Phase 6A)
- Localized pricing via `locale-currency.ts` (Phase 6A)
- `/signup/pro` marketing layout for new signups

---

## Verification

1. From app billing → `/pro` shows centered checkout (no left panel).
2. `/upgrade` redirects to `/pro`.
3. Active Pro → Manage → brief spinner → Paddle portal.
4. Expired / no portal → returns to app billing with error toast.
5. Purchase on `/pro` still completes and syncs entitlements.
