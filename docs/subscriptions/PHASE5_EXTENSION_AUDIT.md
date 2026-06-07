# Phase 5 — Extension Subscription Awareness Audit

**Date:** 2026-05-30  
**Scope:** `v2/novasafe-extension`  
**Goal:** Document how the extension handled (or did not handle) subscription state before Phase 5, and which backend APIs can be reused.

---

## Executive summary

Before Phase 5, the NovaSafe extension was **auth- and vault-aware** but **not subscription-aware**. A placeholder `UserSubscriptionState` existed in state types but was never populated from the API. Mobile, web (app-v2), and billing (auth-v2) already consumed `GET /api/v1/subscriptions/state`; the extension did not.

Phase 5 wires the extension into the same entitlement model without redesigning popup layout, vault screens, or authentication flow.

---

## Extension state architecture (pre-change)

| Concern | Location | Pre-Phase 5 behavior |
|--------|----------|----------------------|
| Auth / session | `extension/auth/*`, `sessionManager.ts` | JWT session, pairing, vault lock |
| Vault cache | `extension/vault/*`, `stateManager.ts` | Memory-only items; sync on unlock |
| User profile | `extensionState.ts` → `user.profile` | Email/name from JWT after pairing |
| Subscription | `extensionState.ts` → placeholder type | **Never fetched**; not on `ExtensionSnapshot` |
| UI / navigation | `store.tsx`, `stateManager.ts` | Route stack persisted; theme in storage |

### How the extension knew Free vs Pro

**It did not.** There was no API client for subscriptions, no plan badge, and no entitlement flags in the popup snapshot.

Password history partially worked by accident: the backend redacts `password_versions` for free users (Phase 1 security fix). The extension could display redacted entries but had no upgrade UX and surfaced raw API errors on delete.

---

## Files audited

### Auth & session
- `src/extension/auth/authService.ts`
- `src/extension/auth/authTypes.ts`
- `src/extension/auth/pairingService.ts`
- `src/extension/auth/sessionManager.ts`
- `src/extension/auth/deviceManager.ts`
- `src/extension/state/authState.ts`
- `src/extension/state/stateMessageHandler.ts`

### State & popup
- `src/extension/state/extensionState.ts`
- `src/extension/state/stateManager.ts`
- `src/components/novasafe/store.tsx`
- `src/popup/extensionClient.ts`
- `src/pages/Index.tsx`

### Vault & features
- `src/extension/vault/vaultSyncService.ts`
- `src/extension/vault/vaultMutationService.ts`
- `src/extension/vault/vaultPasswordHistoryService.ts`
- `src/extension/vault/vaultCustomFieldService.ts`
- `src/components/novasafe/ItemDetails.tsx`
- `src/components/novasafe/item-sections.tsx`
- `src/components/novasafe/TopBar.tsx`
- `src/components/novasafe/LockScreen.tsx`

### API layer
- `src/extension/api/http.ts`
- `src/extension/api/vault.ts`
- `src/extension/api/index.ts` (no subscriptions export pre-change)

### Reference (web billing UX)
- `v2/novasafe-auth-v2/src/routes/connect.extension.index.tsx`
- `v2/novasafe-auth-v2/src/components/auth/screens/ExtensionPairingFailureCard.tsx`
- `v2/novasafe-app-v2` billing / profile pages (Phase 3–4)

---

## Backend APIs (reuse — no duplicates)

| Endpoint | Purpose | Used by extension |
|----------|---------|-------------------|
| `GET /api/v1/subscriptions/state` | Tier, lifecycle, entitlements, limits | **Primary** — `subscriptionsApi.getState()` |
| `GET /api/v1/subscriptions/state?forceRefresh=true` | Post-purchase / stale cache refresh | On unlock, pairing complete, forced refresh |
| `POST /api/v1/subscriptions/sync` | RevenueCat pull | Not wired in extension (web uses after upgrade) |
| `GET /api/v1/membership` | Purchases + portal metadata | Not needed in extension (billing page only) |

### Response fields consumed

- `tier`, `isPro`, `isActive`, `productId`
- `subscriptionStatus`, `cancellationAt`, `expiresAt`, `renewsAt`
- `inGracePeriod`, `billingIssueDetectedAt`
- `entitlements.canUsePasswordHistory` (and siblings for future gates)
- `limits.maxDevices` (informational; enforcement is server-side)

---

## Premium feature audit

| Feature | Intended premium? | Backend enforces? | Extension pre-Phase 5 |
|---------|-------------------|-------------------|------------------------|
| Password history (read) | Yes | Yes — redacts versions for free | Partial display, no upgrade UX |
| Password history (delete) | Yes | Yes — 403 `NOVASAFE_SUBSCRIPTION_REQUIRED` | `alert()` with raw message |
| Custom fields | No (vault core) | No subscription gate | Full CRUD |
| Vault item limits | Yes (free cap) | Yes — mutation 403 | Generic error only |
| CSV import/export | Yes | Yes | Not in extension |
| Multi-device / pairing | Yes (free = 1 trusted device) | Yes — `NOVASAFE_DEVICE_LIMIT` on auth connect | Error only on auth tab; extension showed generic pairing state |

**Principle:** Backend remains source of truth. Extension displays upgrade prompts; it does not enforce entitlements client-side only.

---

## Device limit handling (pre-change)

- Backend: `device-trust.service.ts` returns `NOVASAFE_DEVICE_LIMIT` with user-friendly copy.
- Auth-v2: Inline upgrade CTA on `/connect/extension` when limit hit.
- Extension: Stayed on “Connecting…” until tab closed; no upgrade CTA in popup.

---

## Gaps identified

1. No subscription fetch on unlock / session refresh.
2. No plan badge or billing links in extension UI.
3. Password history lacked `UpgradePrompt` and read-only gating.
4. Device limit not surfaced with friendly messaging in popup.
5. Risk of subscription polling — mitigated by 60s in-memory cache in service worker.

---

## Phase 5 design constraints (preserved)

- No popup layout redesign
- No new billing implementation (links to auth-v2 / app-v2 routes)
- No constant polling (cache + lifecycle-triggered refresh only)
- No team / family / enterprise scope
