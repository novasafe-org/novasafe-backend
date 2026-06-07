# Phase 5 — Extension Subscription Implementation Report

**Date:** 2026-05-30  
**Status:** Complete  
**Package:** `v2/novasafe-extension`

---

## Summary

The extension now loads subscription state from `GET /api/v1/subscriptions/state`, exposes a popup-safe snapshot on `ExtensionSnapshot.subscription`, shows plan badge and billing CTAs in the existing TopBar menu, gates password history with upgrade prompts, and surfaces device-limit messaging during pairing — all without redesigning vault screens or auth flow.

---

## Subscription architecture

```
Popup (React)
  └─ store.tsx ← ExtensionSnapshot.subscription
        ↑ GET_EXTENSION_STATE / STATE_REFRESH messages
Service worker
  └─ stateManager.refreshSubscription()
        └─ subscriptionService (60s cache, memory-only)
              └─ subscriptionsApi.getState(token)
                    └─ GET /api/v1/subscriptions/state
```

### Refresh triggers (no polling loop)

| Event | Behavior |
|-------|----------|
| `initialize()` (session active) | `refreshSubscription()` |
| `unlockVault()` | `refreshSubscription({ force: true })` |
| `handlePairingComplete()` | `refreshSubscription({ force: true })` |
| `refreshWithSessionValidation()` | `refreshSubscription()` |
| `logout()` / `clearSession()` | `clearCache()` + unknown snapshot |
| Popup focus during pairing | `STATE_REFRESH` → includes subscription refresh |

### Subscription states (mapped labels)

| Backend signal | `planLabel` | `statusLabel` | UX |
|----------------|-------------|---------------|-----|
| `tier: free`, `!isPro` | Free | Inactive / Unknown | Upgrade CTA |
| `isPro` + monthly product | Pro Monthly | Active | Full entitlements |
| `isPro` + annual product | Pro Annual | Active | Full entitlements |
| `subscriptionStatus: cancelled`, `isActive` | Pro* | Cancelled | Manage + access until expiry |
| `subscriptionStatus: expired` | Free | Expired | Upgrade CTA |
| Fetch failed, no cache | Unknown | Unknown | Billing links still work |

\* Plan label derived from `productId` when still entitled.

### Billing URLs (`src/config/billing.ts`)

| Link | URL pattern |
|------|----------------|
| Upgrade | `{VITE_AUTH_URL}/upgrade?next={app}/account/billing&ref=extension` |
| Billing | `{VITE_APP_URL}/account/billing` |
| Manage | `{VITE_AUTH_URL}/billing/manage?next=...&ref=extension_manage` |

Default app URL: `https://app.novasafe.io` (override via `VITE_APP_URL`).

---

## Entitlement architecture

| Layer | Responsibility |
|-------|----------------|
| Backend (`services/core`) | Enforce gates; redact password versions; device limits |
| `subscriptionMapper.ts` | Map API → `ExtensionSubscriptionSnapshot` flags |
| `entitlement-errors.ts` | Classify 403 / device limit → user-safe copy |
| UI components | `UpgradePrompt`, `ItemDetails`, `LockScreen`, `TopBar` |

### Password history

- `canUsePasswordHistory` from API entitlements
- Free users: `UpgradePrompt` + read-only history section (redacted entries from backend)
- Delete blocked when `!canUsePasswordHistory`; API errors mapped to friendly messages

### Custom fields

- Unchanged — not a Pro gate in backend or extension

### Device limit

- `isDeviceLimitMessage()` detects backend copy
- `LockScreen` shows `UpgradePrompt` instead of raw destructive error

---

## Files modified

### New files
| File | Purpose |
|------|---------|
| `src/extension/api/subscriptions.ts` | API client |
| `src/config/billing.ts` | Upgrade / billing / manage URLs |
| `src/extension/billing/subscriptionMapper.ts` | Label + snapshot mapping |
| `src/extension/billing/subscriptionService.ts` | Cached fetch |
| `src/extension/billing/subscriptionMapper.test.ts` | Unit tests |
| `src/lib/entitlement-errors.ts` | Error classification |
| `src/components/novasafe/UpgradePrompt.tsx` | Reusable upgrade CTA |

### Modified files
| File | Change |
|------|--------|
| `src/extension/state/extensionState.ts` | `ExtensionSubscriptionSnapshot` on snapshot |
| `src/extension/state/stateManager.ts` | Refresh/clear subscription lifecycle |
| `src/extension/api/index.ts` | Export subscriptions API |
| `src/extension/vault/vaultPasswordHistoryService.ts` | Friendly 403 messages |
| `src/components/novasafe/store.tsx` | Default subscription in snapshot |
| `src/components/novasafe/item-sections.tsx` | `readOnly` / `allowDelete` for history |
| `src/components/novasafe/ItemDetails.tsx` | Upgrade prompt + gating |
| `src/components/novasafe/TopBar.tsx` | Account plan badge + billing links |
| `src/components/novasafe/LockScreen.tsx` | Device limit upgrade assist |
| `src/lib/entitlement-errors.ts` | Trusted-device phrase detection |
| `.env.example` | `VITE_APP_URL` |

### Documentation
| File | Purpose |
|------|---------|
| `docs/subscriptions/PHASE5_EXTENSION_AUDIT.md` | Pre-implementation audit |
| `docs/subscriptions/PHASE5_EXTENSION_IMPLEMENTATION_REPORT.md` | This report |

---

## Test results

### Unit tests (`npm run test`)

| Suite | Tests | Result |
|-------|-------|--------|
| `subscriptionMapper.test.ts` | 6 | Pass |
| `example.test.ts` | 1 | Pass |

Scenarios covered in mapper tests:
- Free user labels and upgrade flag
- Pro monthly / annual labels
- Cancelled-but-active status
- Expired → free-like snapshot
- Pro entitlements → `canUsePasswordHistory`

### Build (`npm run build:extension`)

**Result:** Pass (2026-05-30) — 1736 modules, no TypeScript or Vite errors.

### Manual scenario checklist

| Scenario | Expected | Implementation |
|----------|----------|----------------|
| A — Free user | Free badge, upgrade CTA, restricted history | TopBar + ItemDetails `UpgradePrompt` |
| B — Pro user | Pro badge, full history | `canUsePasswordHistory` from API |
| C — Cancelled, active | Pro badge, “Cancelled” status, manage link | `formatStatusLabel` + `showManage` |
| D — Expired | Free label, upgrade CTA | Mapper + TopBar |
| E — Sync refresh | Updates on unlock / `STATE_REFRESH` | `stateManager` + 60s cache |

---

## Performance & request budget

- **No polling** for subscription state
- **60s in-memory cache** in service worker (`subscriptionService`)
- **One request** per unlock / pairing complete (force refresh)
- **Stale-ok** on session validate within cache window
- Subscription **not persisted** to `chrome.storage` (avoids stale entitlements across restarts; refetched on init when session exists)

---

## Out of scope (unchanged)

- Team / family / enterprise plans
- Shared vaults / RBAC
- In-extension checkout (uses web billing routes)
- CSV import/export in extension

---

## Verification commands

```bash
cd v2/novasafe-extension
npm run test
npm run build:extension
```
