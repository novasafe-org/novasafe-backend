# Phase 4 — Billing & Subscription Management Audit

**Date:** 2026-06-06  
**Scope:** `novasafe-app-v2`, `novasafe-auth-v2`, `services/core`

---

## Pre-Phase 4 State

### Billing page (`_app.account.billing.tsx`)

| Element | Status |
|---------|--------|
| Plan card (gradient) | Real — `GET /membership` + `GET /state` |
| Plan label | Partial — only "Free" / "Pro" |
| Status / renewal | Real but raw `subscriptionStatus` string |
| Upgrade CTA (free) | Real — auth `/upgrade` (Phase 3) |
| Manage plan (Pro) | **Stub** — toast placeholder |
| Invoices table | **Mocked** — webhook events with `$0` amounts |
| Invoice download | **Fake** — toast only |
| Post-purchase sync | Real — `?upgraded=1` |

### Profile page

| Element | Status |
|---------|--------|
| Plan badge | Real — `getState` |
| Upgrade chip | Real — free users only |

### Account layout

Navigation only — no billing stubs.

### Backend APIs (pre-Phase 4)

| Endpoint | Data |
|----------|------|
| `GET /state` | Full `SubscriptionState` |
| `GET /membership` | State + webhook `recentActivity` |
| `POST /sync` | Force RC refresh |
| `mobilePurchaseHistory` | **Write-only** via webhooks |

### Missing capabilities

1. Customer portal / manage subscription
2. Purchase history read API
3. Real billing history display (no fabricated amounts)
4. Lifecycle-aware UI (cancelled, past due, expired)
5. Portal return → entitlement refresh

---

## Provider Portal Support

| Provider | Integration | Portal |
|----------|-------------|--------|
| RevenueCat Web SDK | auth-v2 `billing/client.ts` | `CustomerInfo.managementURL` |
| Paddle | Via RC checkout modal | Paddle portal via RC management URL |
| Direct Paddle API | Not present | N/A |

**Decision:** Provider-managed portal via RC SDK `getCustomerInfo().managementURL` on auth `/billing/manage` — no custom cancel UI.

---

## Data Available for Billing History

| Source | Fields | Amounts |
|--------|--------|---------|
| `mobilePurchaseHistory` | eventType, productId, transactionId, store, purchasedAt | **No amount stored** |
| `mobileSubscriptionEvents` | eventType, processedAt, status | No amount |
| Paddle receipts | Email only | Not in API |

**Limitation:** Invoice PDFs and dollar amounts are not available from backend — documented honestly in UI.

---

## Phase 4 Target

Replace stubs with:
- Real plan labels (Pro Monthly / Pro Annual)
- Lifecycle status labels (Active, Cancelled, Past Due, Expired)
- Provider portal for manage / cancel / resume / payment update
- Real purchase + event history (no fake downloads)
- Entitlement refresh on portal return (`?billingSynced=1`)
