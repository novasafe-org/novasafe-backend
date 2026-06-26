# NovaSafe — Security fix checklist

**Goal:** Make the product secure. Work the list — theory is optional.  
**Source review:** [PRODUCTION_READINESS_AUDIT.md](../PRODUCTION_READINESS_AUDIT.md) (2026-05-30)  
**Context (1 page):** [SECURITY_OVERVIEW.md](./SECURITY_OVERVIEW.md)

Mark items `[x]` in PR descriptions or GitHub issues as you ship fixes.

---

## Blocker — do this first

| | Action | Verify |
|---|--------|--------|
| [x] | **C-01** Prod serves `core` on `mobile-api.novasafe.io` | `./scripts/smoke-mobile-api.sh` ([runbook](./C01_CUTOVER_RUNBOOK.md)) |
| [x] | **C-02** Password history read gated for free users | Free account: no history in API/UI |

---

## P0 — launch gate (C-01–C-10)

### Backend

| ID | Status | Fix |
|----|--------|-----|
| [x] | **C-03** | Signup requires `signupProofToken` after OTP verify |
| [x] | **C-04** | Auth rate limit: 10 / 15 min per IP+email (`rate-limit.middleware.ts`) |
| [x] | **C-05** | `crypto.randomInt` for all OTPs |
| [x] | **C-06** | Web clients get 30m JWT; extension/mobile keep 7d (`JWT_WEB_ACCESS_EXPIRES_IN`) |
| [x] | **C-10** | Bulk sync checks `assertCanCreateVaultItem` per create |
| [x] | **H-09** | CORS allowlist (no `*` when Origin present) — `cors.config.ts` |
| [x] | **H-12** | Signup OTP consumed on verify; single-use proof token |

### Extension

| ID | Status | Fix |
|----|--------|-----|
| [x] | **C-07** | Sync generation token — discard results if locked mid-sync |
| [x] | **C-08** | `VAULT_LOCKED` broadcast + autofill cache cleared |
| [x] | **C-09** | `saveCredential` wired via `vaultMutationService` |
| [x] | **H-14** | Single in-flight `syncVault()` |
| [x] | **H-15** | `savePrompt` cleared on lock |
| [x] | **H-19** | Autofill: exact/subdomain match only (no partial) |

**P0 launch gate:** all C-01–C-10 checked.

---

## P1 — done in code (deploy to apply)

| ID | Status | Fix |
|----|--------|-----|
| [x] | **H-01** | RC API failure retains last-known-good Pro state |
| [x] | **H-03** | 2FA attempt limits + invalidate old challenges |
| [x] | **H-08** | `isNovaSafeEmailVerified()` defaults `false` |
| [x] | **H-17** | Password omitted when `revealSensitive=false` |
| [x] | **H-18** | Strip `encrypted_data` / `iv` from API responses |
| [x] | **H-06** | Extension JWT encrypted at rest (AES-GCM) + 24h TTL |
| [x] | **H-07** | One-time `pairing_code` handoff (replaces `#access_token`) |
| [x] | **H-10** | Extension fail-closed after 24h offline grace |
| [x] | **H-11** | Password reset API + auth-v2 recovery UI |
| [x] | **H-20** | app-v2 password history gated by entitlements |

---

## Automated security (SEC-01.2–4)

| Task | Status | What to build |
|------|--------|---------------|
| [x] | **SEC-01.2** | `scripts/security-api-smoke.sh` + `.github/workflows/security-scan.yml` |
| [x] | **SEC-01.3** | `.github/dependabot.yml` + Trivy image scan in security workflow |
| [x] | **SEC-01.4** | `scripts/run-gitleaks.sh` + [VPS env audit](./VPS_ENV_AUDIT.md) |

---

## Deploy order after this batch

1. **novasafe-backend** (mobile-api) — pairing handoff, password reset, prior P0/P1 fixes  
2. **novasafe-auth-v2** — pairing code redirect + password reset UI  
3. **novasafe-extension** — redeem pairing code, encrypted token storage, offline grace  
4. **novasafe-app-v2** — entitlement UI gates  

Optional env for production:

```env
CORS_ALLOWED_ORIGINS=https://novasafe.io,https://www.novasafe.io,https://app.novasafe.io,https://start.novasafe.io
JWT_WEB_ACCESS_EXPIRES_IN=30m
JWT_ACCESS_EXPIRES_IN=7d
```

---

## Quick re-review after deploy

1. `./scripts/smoke-mobile-api.sh`
2. `./scripts/security-api-smoke.sh https://mobile-api.novasafe.io`
3. Signup without OTP → 403 on create-account
4. Extension pairing: redirect has `pairing_code`, not `access_token`
5. Free user: password history hidden in app-v2 + API

Full M/L findings: [PRODUCTION_READINESS_AUDIT.md](../PRODUCTION_READINESS_AUDIT.md).
