# NovaSafe Production Readiness Audit

**Date:** 2026-05-30  
**Scope:** Full ecosystem — `services/core`, `services/mobile_vault`, `novasafe-app-v2`, `novasafe-auth-v2`, `novasafe-extension`, `novasafe-landing-v2`, RevenueCat, Paddle  
**Method:** Read-only static analysis across auth, vault, extension, subscriptions, security, and performance. No code was modified.

---

## Executive Summary

NovaSafe has a **strong canonical implementation in `services/core`** — vault CRUD, subscription lifecycle, webhook idempotency, Phase 1–5 billing/extension work — but **production traffic still routes through `mobile_vault` (port 3124)** via `mobile-api.novasafe.io`. Several hardening fixes exist only in `core` and are **not live** on the API path consumers use today.

| Dimension | Core codebase | Production deployment | Verdict |
|-----------|---------------|----------------------|---------|
| Authentication | Functional; gaps in rate limits & OTP | Same API path | **Not ready** |
| Extension | Feature-complete; lock/sync races | N/A (client) | **Near ready** — fix lock races |
| Vault | Entitlement gates mostly correct | `mobile_vault` missing read redaction | **Blocked** until cutover |
| Subscriptions | ~85% ready in `core` | Dual writer + RC downgrade risk | **Blocked** |
| Security | Partial OWASP compliance | CORS `*`, OTP bypass | **Not ready** |
| Performance | Acceptable for MVP | Redundant extension sync | **Acceptable** with fixes |

**Recommendation:** Do **not** broadly launch web Pro or market multi-device extension until **Critical** deployment and security items are resolved. Estimated **2–4 weeks** of focused hardening before public launch.

---

## Audit Areas Covered

1. [Authentication](#1-authentication-audit)
2. [Extension](#2-extension-audit)
3. [Vault](#3-vault-audit)
4. [Subscriptions](#4-subscription-audit)
5. [Security](#5-security-audit)
6. [Performance](#6-performance-audit)
7. [RevenueCat / Paddle](#7-revenuecat--paddle-audit)
8. [Production Checklist](#production-readiness-checklist)

---

## Production Readiness Checklist

### Critical Issues — Must fix before launch

| ID | Finding | Risk | Impact | Recommendation | Effort |
|----|---------|------|--------|----------------|--------|
| **C-01** | **Production API serves `mobile_vault`, not hardened `core`** | Critical | All consumer traffic (`mobile-api.novasafe.io`) hits `mobile_vault:3124`. Phase 1 password-history redaction, Phase 2 webhook retry reclaim, and other `core` fixes are **not deployed**. | Cut over nginx to `services/core:3125` with smoke tests and rollback plan; or port all security fixes to `mobile_vault` immediately. Files: `novasafe-deployment/opt/novasafe/infra/nginx/conf.d/mobile-api.conf`, `services/core/deploy/nginx/mobile-api.conf` | **L** (1–2 weeks) |
| **C-02** | **Password history READ ungated on production API** | Critical | `mobile_vault` returns full `password_versions` plaintext on `GET /vault/items/:id`. Free users bypass Pro monetization. `core` fix in `password-version-access.ts` is not live. | Port redaction to `mobile_vault` or complete C-01 cutover. | **S** (hours) or included in C-01 |
| **C-03** | **Signup account creation bypasses OTP verification** | Critical | `POST /onboarding/create-account` does not require verified OTP. `verifyOtp()` never consumes the OTP record. Attacker can register without email proof. Files: `sign-up.service.ts` (lines 51–112), `onboarding.routes.ts` | Require single-use OTP proof (signed nonce or consumed OTP) before `createAccount`. Delete OTP on successful verify. | **M** (2–3 days) |
| **C-04** | **No rate limiting on auth endpoints** | Critical | Login, 2FA, signup OTP, OAuth OTP have no per-IP/account limits. Enables brute-force of passwords and 6-digit codes. Files: `auth.routes.ts`, `onboarding.routes.ts`, `app.ts` | Add rate limiting middleware (5–10 failures / 15 min per account+IP). | **M** (2–3 days) |
| **C-05** | **OTP/2FA codes use `Math.random()`** | Critical | Predictable RNG for signup, OAuth, and 2FA codes. File: `auth-response.service.ts` (`randomOtp`) | Use `crypto.randomInt()` or `crypto.randomBytes`. | **S** (1 hour) |
| **C-06** | **JWT lifetime (7d) vs web cookie (30m) mismatch** | Critical | Leaked JWT remains API-valid for 7 days after browser cookie expires. Files: `auth.config.ts`, `auth-v2/session.server.ts` | Align access token TTL with cookie session or issue short-lived tokens + refresh rotation. | **L** (1 week) |
| **C-07** | **In-flight vault sync can repopulate credentials after lock** | Critical | Extension `syncVault()` has no lock guard. Async sync completing after `clearVaultOnLock()` writes decrypted items back into service-worker memory. Files: `stateManager.ts`, `background/index.ts` | Add sync generation token; discard results if vault locked before apply. | **M** (2–3 days) |
| **C-08** | **Content-script autofill cache bypasses lock (30s TTL)** | Critical | `autofillClient.ts` caches passwords for 30s. Lock does not broadcast to content scripts; cached credentials can still autofill. | Broadcast `VAULT_LOCKED` to tabs; clear `matchCache` on lock. | **M** (1–2 days) |
| **C-09** | **`SAVE_CREDENTIAL` is a no-op reporting success** | Critical | `stateManager.saveCredential()` returns unchanged snapshot; background returns `{ saved: true }`. Save-login flow silently drops credentials. File: `stateManager.ts` (~827) | Implement via `vaultMutationService` or return explicit failure until wired. | **M** (2 days) |
| **C-10** | **Bulk sync bypasses free-tier vault item limits** | Critical | `POST /items` calls `assertCanCreateVaultItem`; `syncBulkUpload` calls `createItem()` directly with swallowed errors. File: `vault-items.service.ts` (656–685) | Enforce entitlement check per `create` op in bulk sync. | **S** (2–4 hours) |

---

### High Priority Issues — Fix within first release cycle

| ID | Finding | Risk | Impact | Recommendation | Effort |
|----|---------|------|--------|----------------|--------|
| **H-01** | **RC API failure forcibly downgrades Pro → Free** | High | `revenueCatSubscriberSync.ts` persists free state when RC returns null/empty (outage, wrong API key). Paid users lose access until next successful sync. | Retain last-known-good state on RC fetch failure; only downgrade on explicit expiry. | **M** (1–2 days) |
| **H-02** | **Duplicate subscription implementations (`core` vs `mobile_vault`)** | High | Two writers to same MongoDB collections; fixes land in `core` but prod runs `mobile_vault`. | Deprecate `mobile_vault` subscription module; single writer. | **L** (with C-01) |
| **H-03** | **2FA verification has no attempt limiting** | High | Unlimited 6-digit guesses within 10-minute TTL; multiple valid codes can coexist. Files: `sign-in.service.ts`, `two-factor.repository.ts` | Max attempts per challenge; invalidate old challenges on new login. | **M** (1–2 days) |
| **H-04** | **Device-limit bypass via User-Agent / historical session match** | High | `device-trust.service.ts` trusts revoked sessions matching `platform` + `userAgent`; client-controlled `X-Device-Id`. | Trust only server-issued device IDs; don't use revoked sessions as trust signals. | **L** (3–5 days) |
| **H-05** | **OAuth pending JWTs non-revocable for up to 1 hour** | High | `oauth_otp_pending` tokens not in sessions collection; logout skips revocation. | Persist pending tokens server-side or denylist `jti`. | **M** (2 days) |
| **H-06** | **Extension stores bearer JWT in plaintext `chrome.storage.local`** | High | 7-day token in extension storage; malware or forensic access yields full API session. File: `tokenStorage.ts` | Encrypt at rest; shorten extension TTL; consider refresh rotation. | **L** (1 week) |
| **H-07** | **Extension pairing passes access token in URL fragment** | High | `#access_token=...` in redirect; brief `sessionStorage` hold. History/XSS/malicious extension risk. Files: `extension-pairing-actions.ts`, `pairingService.ts` | One-time auth code exchanged in service worker. | **L** (1 week) |
| **H-08** | **`isNovaSafeEmailVerified()` defaults unverified → verified** | High | Legacy/missing field skips NovaSafe email OTP on OAuth. File: `auth-user.helper.ts` (lines 10–16) | Default to `false`; explicit migration for legacy users. | **S** (2–4 hours) |
| **H-09** | **CORS `Access-Control-Allow-Origin: *` with Bearer auth** | High | Malicious origins can call API with phished tokens. File: `app.ts` (line 16) | Restrict to known NovaSafe origins per environment. | **S** (2–4 hours) |
| **H-10** | **Extension offline validation keeps revoked sessions active** | High | Non-401 errors during `validateSession` extend session without server confirmation. File: `sessionManager.ts` | Fail closed after offline grace TTL; distinguish network vs auth errors. | **M** (2 days) |
| **H-11** | **No password reset flow wired to backend** | High | Auth UI has forgot-password screens (`AuthFlow.tsx`) but core has no reset endpoints; `LoginCard` notes recovery isn't wired. | Implement secure reset with single-use tokens and session revocation on reset. | **L** (1 week) |
| **H-12** | **Signup OTP replay until expiry** | High | Signup `verifyOtp` does not delete OTP on success (unlike OAuth OTP). | Consume OTP on first successful verify. | **S** (2 hours) |
| **H-13** | **Email/account enumeration** | High | `check-email` returns `{ exists }`; 2FA returns distinct 404 vs 400. | Uniform responses; throttle enumeration endpoints. | **S** (4 hours) |
| **H-14** | **No sync concurrency guard in extension** | High | Concurrent `syncVault()` calls on unlock can complete out of order; amplifies C-07. | Single in-flight sync promise (like `itemFetchInFlight`). | **M** (1–2 days) |
| **H-15** | **`savePrompt` passwords not cleared on lock** | High | Lock clears vault cache but not `ui.savePrompt` (contains plaintext password). File: `stateManager.ts` `clearVaultOnLock` | Set `savePrompt: null` on lock. | **S** (1 hour) |
| **H-16** | **Auto-lock alarm reschedule can extend unlock window** | High | Fallback reschedule uses full `autoLockMinutes` instead of remaining idle time. File: `background/index.ts` | Reuse `scheduleAutoLock()` remaining-time calculation. | **S** (2–4 hours) |
| **H-17** | **`revealSensitive` does not gate primary password in API** | High | Query param only affects custom-field masking; password always returned decrypted. File: `vault-items.service.ts` `getItemById` | Omit/mask password when `revealSensitive=false`. | **M** (1 day) |
| **H-18** | **API detail formatter leaks encryption envelope fields** | High | `mobile-item.formatter.ts` includes `encrypted_data`, `iv` alongside decrypted fields. | Strip internal crypto fields from client responses. | **S** (2–4 hours) |
| **H-19** | **Partial domain autofill matching** | High | `credentialMatcher.ts` partial tier can match wrong domains (e.g. `book` in `facebook.com`). | Require registrable-domain equality for autofill. | **S** (2–4 hours) |
| **H-20** | **app-v2 has no entitlement-based feature gating** | High | Billing page shows plan; vault features rely entirely on API 403s. No `entitlements.*` usage in UI. | Shared subscription hook; gate Pro features with upgrade CTAs. | **M** (2–3 days) |

---

### Medium Priority Issues

| ID | Finding | Risk | Impact | Recommendation | Effort |
|----|---------|------|--------|----------------|--------|
| **M-01** | Webhook retry re-runs lifecycle emails | Medium | Side effects duplicate on failed→retry reclaim. File: `revenueCatWebhookHandlers.ts` | Skip side effects on retry when sync already succeeded. | **S** |
| **M-02** | Orphan RC subscribers (invalid `app_user_id`) | Medium | Webhooks ignored for non-ObjectId IDs; payment in RC never links to user. | Monitor ignored webhooks; ensure RC configured with `user._id` before purchase. | **M** |
| **M-03** | Vault item limit counts all items (notes + logins) | Medium | Free 15-password limit uses total `countDocuments`. File: `subscription.service.ts` | Count login-category items only for password limit. | **S** |
| **M-04** | Paywall treats "pending" entitlement as success | Medium | User sees Pro success before backend confirms. File: `PaywallCard.tsx` | Show "confirming payment" until `status === "active"`. | **S** |
| **M-05** | `/subscriptions/debug` open if `SUBSCRIPTION_DEBUG_KEY` unset | Medium | Any authenticated user sees webhook history in prod misconfig. | Disable in production or require key always. | **S** |
| **M-06** | API URL inconsistency across clients | Medium | `api.novasafe.io` → legacy vault; `mobile-api.novasafe.io` → `mobile_vault`. Dockerfile/CI defaults differ. | Standardize one consumer API host. | **M** |
| **M-07** | Legacy Razorpay billing silo | Medium | Pre-RC subscribers may not appear in `mobileSubscriptions`. | Confirm zero active Razorpay subs; migrate or bridge. | **L** |
| **M-08** | Master password transits extension runtime messages | Medium | `UNLOCK_VAULT` message contains password briefly. | Document accepted risk or use offscreen validation. | **M** |
| **M-09** | Extension resolves user from JWT without signature verify | Medium | `pairingService.resolveUserFromToken` base64-decodes only. | Use `validateSession` response as sole user source. | **S** |
| **M-10** | Extension full-pull sync only (no delta `since`) | Medium | Every sync fetches up to 500 items with full passwords. | Track server revision; use delta pull. | **L** |
| **M-11** | Duplicate API calls on unlock/popup open | Medium | verify-master-password + subscription + pull + dashboard + validateSession. | Coalesce refresh calls. | **M** |
| **M-12** | Archive is client-side tag only | Medium | `ARCHIVED_TAG` in tags array; other clients may not honor. | Server-side `archived` field. | **L** |
| **M-13** | Extension create-item lacks friendly 403 UX | Medium | No upgrade prompt on vault limit hit (unlike password history). | Map subscription errors in `vaultMutationService`. | **S** |
| **M-14** | Auto-lock double-invocation path | Medium | Alarm handler calls lock twice; amplifies sync race. File: `background/index.ts` | Single lock entry point. | **S** |
| **M-15** | `deleteAccount` requires only bearer — no re-auth | Medium | XSS/unattended device can delete account. | Require password/2FA step-up. | **M** |
| **M-16** | `verifyMasterPassword` / `changeMasterPassword` — no rate limit | Medium | Online brute-force for authenticated sessions. | Per-user rate limits. | **S** |
| **M-17** | Session `lastActivity` not updated on requests | Medium | Stale session list; idle timeout server-side impossible. | Touch `lastActivity` in auth middleware (throttled). | **S** |
| **M-18** | Apple first-time signup skips NovaSafe email OTP | Medium | Inconsistent with Google flow. File: `oauth-apple.service.ts` | Align Apple with Google OTP requirement. | **S** |
| **M-19** | Google OAuth email OTP flow incomplete on auth-v2 | Medium | Login returns `otp-required` but UI shows error only. | Complete OTP UI with server-side `tempSessionToken`. | **M** |
| **M-20** | Pairing creates session without binding `installationId` | Medium | Re-pairing mints new 7-day tokens without revoking prior extension sessions. | Store `installationId` on session; revoke on re-pair. | **M** |
| **M-21** | `canUseAdvancedSecurity` defined but never enforced | Medium | Entitlement key exists; no route guards. | Gate dashboard security endpoints or remove key. | **S** |
| **M-22** | Custom fields ungated (product decision pending) | Medium | All users can CRUD custom fields. | Product decision: gate or document as free. | **S** |
| **M-23** | No scheduled subscription reconciliation job | Medium | Users stuck on wrong tier if webhook + manual sync both fail. | Nightly stale-subscription refresh job. | **M** |
| **M-24** | Favorite toggle optimistic desync | Medium | Rapid double-clicks can leave wrong favorite state. | Per-item mutation lock. | **S** |

---

### Low Priority Issues

| ID | Finding | Risk | Impact | Recommendation | Effort |
|----|---------|------|--------|----------------|--------|
| **L-01** | `getSessions` exposes `tokenId` | Low | Aids targeted session attacks if combined with leaks. | Omit or hash in client response. | **S** |
| **L-02** | bcrypt cost factor 10 | Low | Below modern baseline (12+). | Increase gradually. | **S** |
| **L-03** | No refresh token / rotation | Low | Long-lived bearer-only model. | Add refresh rotation. | **L** |
| **L-04** | Expiration maps to `inactive` not `expired` in some cases | Low | UI label inconsistency; entitlements still correct. | Refine `deriveLifecycleStatus`. | **S** |
| **L-05** | Device limits relaxed in development by default | Low | Staging misconfig could bypass limits. | Explicit opt-in only. | **S** |
| **L-06** | Billing history lacks dollar amounts / invoice PDFs | Low | Receipts via Paddle email only. | Document limitation; optional future integration. | **M–L** |
| **L-07** | 2FA toggle without step-up auth | Low | Attacker with session can disable 2FA. | Require password to disable. | **S** |
| **L-08** | Deleted account restore on re-signup without re-verification | Low | Soft-deleted accounts restored with attacker password. | Require OTP + cooling period. | **M** |
| **L-09** | Legacy `/mobile/auth` routes duplicated | Low | Expanded attack surface. | Deprecate with monitoring. | **M** |
| **L-10** | `revokeSession` silent success on non-owned session | Low | Confusing remote logout UX. | Return 404 when `modifiedCount === 0`. | **S** |
| **L-11** | Landing site `dangerouslySetInnerHTML` in chart component | Low | Static marketing site; limited attack surface. | Sanitize or replace chart rendering. | **S** |

---

### Future Improvements

| Area | Improvement | Effort |
|------|-------------|--------|
| Extension | Delta sync via `/revision` + `since` parameter | **L** |
| Extension | Server-side `archived` field with cross-client consistency | **L** |
| Extension | Auth code pairing handoff (replace fragment token) | **L** |
| Backend | Refresh token rotation across web + extension | **L** |
| Backend | Nightly subscription reconciliation cron | **M** |
| Backend | Admin reconcile tool for orphan RC subscribers | **M** |
| app-v2 | Entitlement-driven UI gates on all Pro features | **M** |
| app-v2 | Paddle transaction amounts in billing history | **M–L** |
| Ops | Monitoring/alerting on failed/ignored RC webhooks | **M** |
| Ops | Unified API hostname documentation and CI alignment | **S** |
| Product | Team/family/enterprise plans (explicitly out of current scope) | **XL** |

---

## 1. Authentication Audit

### Current state

| Flow | Status | Notes |
|------|--------|-------|
| Email/password login | ✅ Works | No rate limiting |
| Signup + OTP | ⚠️ Broken trust model | OTP verify does not gate account creation (C-03) |
| Google OAuth | ✅ Mostly works | Email OTP flow incomplete in auth-v2 UI (M-19) |
| Apple OAuth | ✅ Works | Skips NovaSafe OTP for new users (M-18) |
| 2FA | ⚠️ Weak | No attempt limits (H-03) |
| Session cookies (web) | ✅ HttpOnly, SameSite=lax | 30m cookie vs 7d JWT (C-06) |
| Extension pairing | ✅ Functional | Token in URL fragment (H-07); JWT in storage (H-06) |
| Session expiry | ⚠️ Partial | Server revocation works; extension offline grace too permissive (H-10) |
| Logout | ✅ Works | OAuth pending tokens not revoked (H-05) |
| Remote logout | ✅ Works | `revokeSession` by `tokenId` |
| Password reset | ❌ Not implemented | UI stubs exist; no backend (H-11) |

### Positive controls

- Server-side session revocation via `jti`/`tokenId` on each API call (`auth.middleware.ts`)
- Open-redirect protection on post-auth `next` (`routes.config.ts`)
- Extension pairing validates `redirect_uri` host suffix and `state` CSRF parameter
- OAuth pending tokens blocked from vault/settings routes
- Apple nonce verification with SHA-256
- Vault lock separate from account auth in extension

### OWASP snapshot

| Category | Status |
|----------|--------|
| A01 Broken Access Control | **Fail** — OTP bypass, device-limit bypass, bulk sync limits |
| A02 Cryptographic Failures | **Fail** — `Math.random()` OTPs, plaintext extension tokens |
| A05 Security Misconfiguration | **Fail** — CORS `*`, dev device-limit relax |
| A07 Identification & Auth Failures | **Fail** — no rate limits, 2FA brute-force |

---

## 2. Extension Audit

### Current state (post Phase 5)

| Area | Status | Notes |
|------|--------|-------|
| Pairing flow | ✅ | Subscription refresh on complete |
| Unlock flow | ✅ | Subscription + vault sync on unlock |
| Auto-lock | ⚠️ | Reschedule bug (H-16); double lock (M-14) |
| Vault cache | ⚠️ | Memory-only (good); sync-after-lock race (C-07) |
| Service worker lifecycle | ✅ | Initializes auth + state manager |
| Popup lifecycle | ✅ | Focus refresh during pairing |
| Browser restart | ✅ | Vault always locked; session may persist |
| Subscription awareness | ✅ | Phase 5 complete — plan badge, upgrade CTAs |
| Autofill | ⚠️ | Cache bypasses lock (C-08); partial domain match (H-19) |
| Save credential | ❌ | No-op (C-09) |

### Storage policy (verified)

| Data | Persisted? | Location |
|------|------------|----------|
| Vault items (decrypted) | ❌ No | Service-worker memory only |
| JWT access token | ✅ Yes | `chrome.storage.local` (plaintext) |
| Session metadata | ✅ Yes | Extension storage |
| Subscription snapshot | ❌ No | Refetched on init/unlock |
| Master password | ❌ No | Transient in runtime message only |

### Positive controls

- Legacy `novasafe.vaultCache` removed on init
- Pairing completes with vault locked
- Autofill suggestion UI strips passwords from display
- Password history delete routes use backend entitlement middleware
- Item detail fetch dedup via `itemFetchInFlight`

---

## 3. Vault Audit

### Sync & CRUD

| Operation | Backend enforcement | Extension behavior |
|-----------|--------------------|--------------------|
| Create item | ✅ `assertCanCreateVaultItem` on `POST /items` | Server 403; no upgrade UX (M-13) |
| Bulk sync create | ❌ No limit check (C-10) | N/A (mobile path) |
| Update/delete | ✅ Ownership via `userId` filter | Optimistic updates with rollback |
| Pull sync | ✅ User-scoped query | Full pull only (M-10) |
| Favorites | ✅ Server field | Optimistic toggle (M-24) |
| Archive | ⚠️ Tag-based only (M-12) | Client `ARCHIVED_TAG` |
| Search | ✅ Client-side filter | No server search endpoint needed |
| Custom fields | ✅ Ownership | No subscription gate (M-22) |
| Password history read | ✅ Redacted in `core` / ❌ in `mobile_vault` | Upgrade prompt (Phase 5) |
| Password history mutate | ✅ `requireEntitlement` | Friendly 403 messages |

### Cache consistency risks

1. Concurrent sync without mutex (H-14)
2. Sync completing after lock (C-07)
3. Archive tag not synced semantically across clients (M-12)
4. Favorite optimistic desync (M-24)

---

## 4. Subscription Audit

### Lifecycle handling (`core` — code-ready)

| Event | Mapped behavior | Entitlements |
|-------|----------------|--------------|
| INITIAL_PURCHASE / RENEWAL | Active Pro | Full Pro set |
| CANCELLATION | Pro until `expiresAt`, status `cancelled` | Retained until expiry |
| EXPIRATION | Free tier | Revoked |
| Grace period | Pro via `inGracePeriod` | Retained |
| Billing issue | Status `billing_issue` | Per RC row |
| RC API null/error | **Downgrade to free** (H-01) | Revoked incorrectly |

### Entitlement enforcement matrix

| Entitlement | `core` backend | `mobile_vault` (prod) | app-v2 UI | extension UI |
|-------------|---------------|----------------------|-----------|--------------|
| Unlimited passwords | ✅ | ✅ | ❌ No gate | ❌ No pre-check |
| Password history read | ✅ Redacted | ❌ Plaintext (C-02) | ❌ | ✅ Upgrade prompt |
| Password history mutate | ✅ | ✅ | N/A | ✅ |
| CSV import/export | ✅ | ✅ | ❌ | N/A |
| Cloud sync | ✅ | ✅ | N/A | N/A |
| Multi-device | ✅ | ✅ | N/A | ✅ Device limit prompt |
| Advanced security | ❌ Not gated | ❌ | ❌ | N/A |
| Custom fields | ❌ Not gated | ❌ | ❌ | N/A |

### Upgrade / billing / manage flows

| Flow | auth-v2 | app-v2 | Status |
|------|---------|--------|--------|
| New user Pro signup | `/signup/pro` | N/A | ✅ |
| Existing user upgrade | `/upgrade` | Billing + Profile CTAs | ✅ (Phase 3) |
| Post-purchase sync | `?upgraded=1` | `?billingSynced=1` | ✅ |
| Manage subscription | `/billing/manage` → RC portal | Link to auth portal | ✅ (Phase 4) |
| Billing history | N/A | Real purchase list (no amounts) | ✅ (Phase 4) |

### Extension subscription (Phase 5 — complete)

- `GET /api/v1/subscriptions/state` with 60s cache
- Plan badge + billing links in TopBar menu
- Password history gating + `UpgradePrompt`
- Device limit messaging on LockScreen

---

## 5. Security Audit

### API authorization

- **Ownership:** Vault queries use `userId` filter — no IDOR observed in standard CRUD paths.
- **Subscription gates:** Middleware `requireEntitlement` on mutate routes; read redaction for password history in `core` only.
- **Settings/export:** CSV routes gated; account deletion lacks re-auth (M-15).

### Token exposure surfaces

| Surface | Exposure | Severity |
|---------|----------|----------|
| Web HttpOnly cookie | Token not in JS | Low |
| Extension `chrome.storage.local` | Plaintext JWT 7d | High (H-06) |
| Pairing URL fragment | Brief token in history | High (H-07) |
| API responses | `encrypted_data`/`iv` leaked | High (H-18) |
| CORS `*` + Bearer | Cross-origin API calls | High (H-09) |

### Password history security (Phase 1)

Fixed in `core` (`password-version-access.ts`). **Not deployed** on production API path (C-02).

---

## 6. Performance Audit

### Extension

| Operation | API calls observed | Issue |
|-----------|-------------------|-------|
| Unlock | verify-master-password + subscription (force) + pull + dashboard | Duplicate (M-11) |
| Popup open | `GET_EXTENSION_STATE` + `validateSessionIfStale` | Acceptable |
| Item select | Detail fetch even on cache hit | Redundant |
| Sync | Full pull up to 500 items | No delta (M-10) |
| Subscription | 60s cache | ✅ No polling |
| Pairing poll | 2s interval while pairing | Acceptable (bounded) |

### Backend

| Area | Observation |
|------|-------------|
| Vault pull | Up to 500 items with per-item decrypt + custom fields — potential N+1 |
| Dashboard stats | Decrypts up to 50 items for strength calculation |
| Subscription read | Cached persisted state with expiry re-evaluation — efficient |
| Webhook processing | Idempotent claim — efficient |

### Memory

- Extension vault cache cleared on lock (except race C-07)
- `savePrompt` not cleared (H-15)
- Content autofill cache 30s TTL (C-08)

---

## 7. RevenueCat & Paddle Audit

### RevenueCat (`core` implementation)

**Strengths:**
- Timing-safe webhook auth
- Idempotent claim with 5-minute stale reclaim (Phase 2)
- Failed webhooks return HTTP 500 for RC retry
- Always syncs from RC REST API (not webhook payload alone)
- 16+ automated tests for idempotency + lifecycle mapping

**Gaps:**
- Not on production webhook ingress (C-01)
- Side-effect duplication on retry (M-01)
- Orphan app_user_id handling (M-02)
- RC failure → free downgrade (H-01)

### Paddle (indirect via RevenueCat)

| Step | Implementation | Status |
|------|----------------|--------|
| Checkout | RC Web SDK → Paddle modal in auth-v2 | ✅ Correct |
| Post-purchase | `POST /subscriptions/sync` | ✅ |
| Manage/cancel | RC `managementURL` portal | ✅ |
| Direct Paddle webhooks | Not used (by design) | ✅ |

No direct Paddle integration required while RC remains orchestrator.

---

## Prioritized Remediation Roadmap

### P0 — Before any public launch (week 1–2)

1. **C-01 + C-02 + H-02** — API cutover to `core` or port security fixes to `mobile_vault`
2. **C-03 + C-05 + H-12** — Signup OTP trust model + CSPRNG
3. **C-04 + H-03** — Auth rate limiting
4. **C-07 + C-08 + H-14 + H-15** — Extension lock safety
5. **C-09 + C-10** — Save credential + bulk sync limits

### P1 — First release cycle (week 2–4)

6. **C-06 + H-06 + H-07** — Token lifecycle hardening
7. **H-01** — Fail-safe RC sync
8. **H-04 + H-08 + H-09 + H-10** — Device trust, email verify default, CORS, extension validation
9. **H-11** — Password reset
10. **H-17 + H-18 + H-19 + H-20** — API response hardening + app-v2 entitlement gates

### P2 — Post-launch stabilization

11. **M-01 through M-24** — Webhook side effects, reconciliation, archive model, performance
12. **L-01 through L-11** — Polish and technical debt

---

## Services Not Audited in Depth

| Service | Notes |
|---------|-------|
| `novasafe-landing-v2` | Static marketing site; low risk. Chart component uses `dangerouslySetInnerHTML` (L-11). |
| `services/vault` (legacy) | Razorpay-era billing; may still serve `api.novasafe.io` (M-06, M-07). |
| Mobile native apps | Out of workspace scope; share same `mobile-api` backend. |

---

## References

| Document | Relevance |
|----------|-----------|
| `docs/billing-audit/REVENUECAT_AUDIT.md` | RC architecture (pre-Phase 2) |
| `docs/billing-audit/SUBSCRIPTION_SECURITY_AUDIT.md` | Password history gap (fixed in `core`) |
| `docs/subscriptions/PHASE2_WEBHOOK_RELIABILITY_REPORT.md` | Webhook retry fix |
| `docs/subscriptions/PHASE5_EXTENSION_AUDIT.md` | Extension subscription (complete) |
| `docs/subscriptions/WEBHOOK_FLOW_AUDIT.md` | Webhook flow detail |

---

## Overall Verdict

| Component | Readiness |
|-----------|-----------|
| `services/core` (code) | **~80%** — strong foundation, auth gaps remain |
| Production deployment | **~55%** — wrong backend serving traffic |
| novasafe-auth-v2 | **~75%** — upgrade/billing work; auth hardening needed |
| novasafe-app-v2 | **~70%** — billing display works; no entitlement UI gates |
| novasafe-extension | **~75%** — feature-complete; lock/sync races block launch |
| RevenueCat/Paddle integration | **~80%** in code; **~60%** deployed |

**Launch gate:** Resolve all **Critical** items (C-01 through C-10) before marketing NovaSafe Pro on web or extension to a general audience.
