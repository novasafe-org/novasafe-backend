# Mobile Notification & i18n Audit

**Date:** 2026-06-09  
**App:** `v2/novasafe-capacitor-app`

---

## Summary

Implemented premium notification UX for auth flows and centralized error sanitization. Full app-wide i18n migration is **partial** — login/auth notification keys are localized; many screens still use hardcoded English.

---

## What Was Fixed

| Issue | Solution |
|-------|----------|
| Huge red device-limit banner | `DeviceLimitDialog` — blue/shield info modal, not error toast |
| Google back → SHA-1/OAuth wall of text | `12501` / cancel codes → silent; OAuth config logged to `console.error` only |
| Oversized red toasts | Compact bottom-center toasts with success/info/warning/error variants |
| Technical API errors shown raw | `classifyAuthError()` + `useNotify().fromAuthError()` |

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/notifications/notify.ts` | Central notify API with auto-dismiss durations |
| `src/lib/notifications/sanitizeAuthError.ts` | Classify + sanitize auth errors |
| `src/hooks/useNotify.ts` | i18n-aware notify hook |
| `src/components/notifications/DeviceLimitDialog.tsx` | Pro upgrade modal for device limit |

---

## Modified Files

| File | Change |
|------|--------|
| `src/components/ui/toast.tsx` | Variants, compact layout, bottom-center |
| `src/components/ui/toaster.tsx` | Icons per variant |
| `src/hooks/use-toast.ts` | Auto-dismiss by duration |
| `src/mobile/services/auth/googleAuth.ts` | Cancel-first; no user-facing SHA-1 |
| `src/mobile/api/errorMessages.ts` | Uses sanitizer |
| `src/pages/auth/Login.tsx` | Full i18n + notify + device limit modal |
| `src/pages/auth/Signup.tsx` | Silent OAuth cancel |
| `public/i18n/en-us.json` | `notifications.*`, `subscription.deviceLimit.*`, `auth.login.*` |
| `public/i18n/hi.json` | Same keys (Hindi) |
| `public/i18n/mr.json` | Same keys (Marathi) |

---

## i18n Audit (Hardcoded Strings)

### Localized in this pass (~45 keys)

- `notifications.errors.*`
- `notifications.auth.*`
- `notifications.success.*`
- `subscription.deviceLimit.*`
- `auth.login.*` (Login screen)

### Already localized (pre-existing)

Screens using `useI18n()` / `t()`:

- Dashboard, Vault, ItemDetail, Generator, AddItem
- Profile (partial), ResetVaultPinOtp
- Many `playStore.*` / settings disclosure pages

### Still hardcoded (manual review needed) — estimated **150+** user-facing strings

| Area | Examples | Files |
|------|----------|-------|
| Signup flow | OTP titles, Google/Apple signup toasts | `Signup.tsx`, `OtpVerification.tsx` |
| Settings | Import/export toasts, device session messages | `ImportData.tsx`, `ExportData.tsx`, `DevicesSessions.tsx` |
| Subscription / billing | Purchase errors, RC messages | `useSubscription.tsx`, `ProUpgradeScreen.tsx`, `Membership.tsx` |
| Vault operations | Save/delete toasts | `AddItem.tsx`, `ItemDetail.tsx` |
| Auth (other) | 2FA, lock screen, onboarding | `LoginTwoFactor.tsx`, `LockScreen.tsx`, `Onboarding*.tsx` |
| Upgrade prompts | `featureBlockedCopy()` in `subscriptionFeatures.ts` | Pro feature gate copy |

**Recommendation:** Migrate screen-by-screen using `useNotify()` + `t("key")` pattern established in `Login.tsx`.

---

## Notification Design Spec (Implemented)

| Type | Color | Duration |
|------|-------|----------|
| Success | Green accent | 2s |
| Info | Blue/primary | 3s |
| Warning | Amber | 4s |
| Error | Soft red (not full banner) | 5s |

Position: bottom center, max-width 380px, `rounded-2xl`, glass/blur.

---

## Testing Checklist (second laptop)

1. **Google login success** — compact green toast
2. **Google login cancel (Back)** — no toast, stay on login
3. **Google login failure (bad network)** — short error toast, no SHA-1 text
4. **Email login success** — welcome toast
5. **Email login failure** — short error, no paragraph
6. **Device limit (if old backend)** — shield modal, not red banner
7. **Password history (free)** — existing Pro upgrade prompt unchanged
8. **Hindi/Marathi** — switch locale in Profile → login strings translate

### Rebuild

```bash
cd v2/novasafe-capacitor-app
npm install
npm run build
npx cap sync
# Android Studio / Xcode rebuild
```

No backend deploy required for this UX pass (device-limit modal is defensive if old API still returns limit errors).

---

## Remaining Technical Messages (user-visible risk)

Grep for these patterns in future passes:

- `toast({ title:` with string literals
- `toast.error(` with raw `err.message`
- `throw new Error(` with OAuth/SHA/config text in `src/mobile` and `src/pages`

Log-only (safe): `console.error` / `console.warn` in `googleAuth.ts`.
