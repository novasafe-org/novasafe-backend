# Mobile Device Restriction Audit & Fix

**Date:** 2026-06-07  
**Scope:** Remove login/device-count gates; keep Pro feature entitlements intact.

---

## Executive Summary

Free users were blocked from signing in on a second device because **backend** `evaluateDeviceLogin()` returned `NOVASAFE_DEVICE_LIMIT`. The mobile app surfaced that error in `auth.service.ts`. The web app appeared to work when `SUBSCRIPTION_RELAX_DEVICE_LIMITS=true` was set in some environments, or when users only had one trusted device.

**Fix:** Login is always allowed. Device registration and counts continue for analytics/UI. Pro gates (password history, CSV, cloud sync entitlement API, etc.) are unchanged.

---

## 1. Where Login Was Blocked

### Backend (root cause) — API response blocking

| Service | File | Lines (approx.) | Mechanism |
|---------|------|-----------------|-----------|
| **mobile_vault** (mobile API) | `services/mobile_vault/src/services/deviceTrustService.ts` | `evaluateDeviceLogin()` | Returned `allowed: false` + `NOVASAFE_DEVICE_LIMIT` when free user exceeded `maxDevices` (1) on a new device |
| **mobile_vault** | `services/mobile_vault/src/controllers/mobileAuthController.ts` | `buildAuthResponse()` | Called `evaluateDeviceLogin` before session creation |
| **core** (web/extension API) | `services/core/src/modules/auth/services/device-trust.service.ts` | `evaluateDeviceLogin()` | Same logic |
| **core** | `services/core/src/modules/auth/services/auth-response.service.ts` | `buildFullSession()` | Blocked session creation on `allowed: false` |

### Mobile frontend — error surfacing (not the root cause)

| File | Mechanism |
|------|-----------|
| `v2/novasafe-capacitor-app/src/mobile/services/auth.service.ts` | `assertAuthPayloadAllowed()` threw on `NOVASAFE_DEVICE_LIMIT` and `NOVASAFE_SUBSCRIPTION_REQUIRED` |

### Mobile frontend — UI gates (not login, but related)

| File | Mechanism |
|------|-----------|
| `useSubscription.tsx` | `multiDeviceSync` feature gate used device count |
| `subscriptionFeatures.ts` | Free plan blocked `multiDeviceSync` when `deviceCount > 1` |
| `Profile.tsx` | Devices & Sessions nav required Pro via `multiDeviceSync` |

### Not login gates (unchanged)

| Area | Still Pro-gated |
|------|-----------------|
| `ItemDetail.tsx` | Password history |
| `ImportData.tsx` / `ExportData.tsx` | CSV import/export |
| `Profile.tsx` | Cloud sync toggle (`cloudSync` entitlement) |
| Backend `entitlement.middleware.ts` | API 403 for Pro features |

---

## 2. Web App Comparison

Web auth (`novasafe-auth-v2`) uses **core** `buildFullSession()` — same backend device check as mobile historically.

Web billing UI (`novasafe-app-v2`) shows device limits **informationally** only:

```typescript
// subscription-display.ts — display only, no login block
value: e.canUseMultiDevice ? "All your devices" : `${l.maxDevices} trusted device`
```

Web did not have extra client-side login blocking beyond API errors. Aligning backend fixes both web and mobile login paths.

---

## 3. Backend Behavior After Fix

`evaluateDeviceLogin()` in **both** `core` and `mobile_vault`:

- Still seeds/registers trusted devices
- Still returns `devicePolicy` with `trustedDeviceCount` / `maxTrustedDevices` for UI
- **Always** returns `{ allowed: true, policy, deviceKey }`
- Never returns `NOVASAFE_DEVICE_LIMIT` for login

`registerTrustedDeviceForLogin()` and session creation unchanged.

---

## 4. Files Changed

### Backend (`novasafe-backend`)

| File | Change |
|------|--------|
| `services/core/src/modules/auth/services/device-trust.service.ts` | Remove login denial branch |
| `services/mobile_vault/src/services/deviceTrustService.ts` | Remove login denial branch |

### Mobile (`v2/novasafe-capacitor-app`)

| File | Change |
|------|--------|
| `src/mobile/services/auth.service.ts` | Remove device-limit / subscription-required login error mapping |
| `src/subscription/state/useSubscription.tsx` | `multiDeviceSync` gate always allows (informational only) |
| `src/subscription/subscriptionFeatures.ts` | `multiDeviceSync` allowed on free tier |
| `src/pages/Profile.tsx` | Devices & Sessions nav no longer Pro-gated |

---

## 5. Deployment Requirements

### Order

1. **Deploy `services/mobile_vault`** (mobile app auth API — port 3124)
2. **Deploy `services/core`** (web auth + extension pairing)
3. **Rebuild mobile app** (Capacitor Android/iOS)

### Environment variables

**No new env vars required.**  
`SUBSCRIPTION_RELAX_DEVICE_LIMITS` is no longer needed for login — behavior is unconditional in code.

Optional existing vars (unchanged):

- `FREE_PLAN_MAX_DEVICES` — still used for **display** limits in subscription state
- `REVENUECAT_*` — unchanged

### Migrations

None.

### Mobile rebuild

| Step | Required |
|------|----------|
| `git pull` | Yes |
| `npm install` (in `v2/novasafe-capacitor-app`) | Yes |
| `npx cap sync` | Yes |
| Android rebuild | Yes |
| iOS rebuild | Yes (if testing iOS) |

Backend-only deploy fixes login even **without** mobile rebuild, but mobile rebuild removes stale client error messages and opens Devices & Sessions for free users.

---

## 6. Testing Checklist (fresh machine)

Prerequisites: backend deployed, mobile app rebuilt, **new login** (clear app data / fresh install).

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Free user: Android + Web login | ✅ Both succeed |
| 2 | Free user: Android + Extension pairing | ✅ Succeeds (core deploy) |
| 3 | Free user: Android + second Android / iPhone | ✅ Succeeds |
| 4 | Free user: Password History | ❌ Upgrade prompt (Pro) |
| 5 | Pro user: Password History | ✅ Allowed |
| 6 | Existing Pro subscriptions | ✅ Unaffected |
| 7 | Free user: Profile → Devices & Sessions | ✅ Opens (informational) |
| 8 | Free user: Enable cloud sync toggle | ❌ Still Pro-gated (unchanged) |

### Manual verification steps

1. Create or use a **free** account on Device A (e.g. Android).
2. Log out. Log in same account on Device B (different phone, web, or emulator).
3. Confirm no “Free plan allows one trusted device” error.
4. On free account, open a vault item → Password History → confirm upgrade prompt.
5. On Pro account, confirm Password History works.

### Network check

DevTools / logcat: login response should be `success: true` with `token`, not `code: NOVASAFE_DEVICE_LIMIT`.

---

## 7. Intentionally Unchanged

- RevenueCat / Paddle / billing flows
- Password history entitlement (`canUsePasswordHistory`)
- CSV import/export Pro gates
- Cloud sync API entitlement (`canUseCloudSync`)
- Extension entitlement error handling (backend no longer emits device limit on login)
- Device tracking tables and session `deviceId` registration
