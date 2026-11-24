# Session auth environment setup (PR #222)

Guide for **mobile dual-token sessions**: access JWT + opaque refresh, rotation with device binding, biometric/OTP step-up, adaptive risk windows, mobile-only gating, and optional device attestation.

**Code:** `services/core` (`auth.config.ts`, `token-refresh`, `session-step-up`, `session-risk`, `device-attestation`, `mobile-client.helper`).  
**Routes:** refresh / step-up are mounted only on `/mobile/auth` (not `/api/v1/auth`).

Do **not** commit real secrets. Use placeholders below and inject secrets via your secret store / CI.

---

## Quick start (first clone)

1. From repo root, copy the Core template and open it:

   ```bash
   cp services/core/.env.example services/core/.env
   ```

2. Set the **minimum** for local session auth:

   ```bash
   # services/core/.env
   JWT_SECRET=local-dev-only-change-me-to-a-long-random-string
   NODE_ENV=development
   DEVICE_ATTESTATION_MODE=off
   # Mongo + RESEND as already documented in .env.example
   ```

3. Start Core (`pnpm` from repo root per project README). Confirm the service refuses to boot if `JWT_SECRET` is empty.

4. Run session unit tests (no Google/Apple credentials needed when mode is `off`):

   ```bash
   cd services/core
   JWT_SECRET=test DEVICE_ATTESTATION_MODE=off node --import tsx --test \
     src/modules/auth/helpers/mobile-client.helper.test.ts \
     src/modules/auth/services/token-refresh.service.test.ts \
     src/modules/auth/services/session-step-up.service.test.ts \
     src/modules/auth/services/session-risk.service.test.ts \
     src/modules/auth/services/device-attestation.service.test.ts \
     src/modules/auth/tokens/jwt.refresh-token.test.ts
   ```

5. Point the Flutter app at this Core instance. Debug builds send **mock** attestation envelopes; keep `DEVICE_ATTESTATION_MODE=off` locally unless you are testing attestation.

**Local defaults that are safe:** attestation `off`, default TTLs (`1h` / `90d`), default rotation (30d / 24h). Web/extension clients never receive refresh tokens.

---

## Variable reference

Values are suggestions. Prefer long random secrets in staging/production (e.g. 32+ bytes from a CSPRNG).

### JWT / tokens

| Variable | Purpose | Local | Staging | Production |
|----------|---------|-------|---------|------------|
| `JWT_SECRET` | HMAC secret for access JWTs. **Required** — process exits if empty. | Long random local-only string (never reuse prod). | Dedicated staging secret. | Dedicated high-entropy secret; rotate via runbook; never log. |
| `JWT_ACCESS_EXPIRES_IN` | Mobile/native access JWT lifetime (`1h`, `30m`, …). | `1h` (default) or shorter for debugging. | `1h` | `1h` (default). |
| `JWT_WEB_ACCESS_EXPIRES_IN` | Access JWT lifetime when request is treated as web. | `30m` (default) | `30m` | `30m` (default). |
| `JWT_REFRESH_EXPIRES_IN` | Opaque refresh lifetime (stored as SHA-256 hash on session). | `90d` (default); use `7d` if you want faster local expiry tests. | `90d` | `90d` (default) unless product policy says otherwise. |

Refresh tokens are **mobile-only** (`isMobileAppClient`). Web login responses set `refreshToken: null`.

### Adaptive session rotation / risk

| Variable | Purpose | Local | Staging | Production |
|----------|---------|-------|---------|------------|
| `SESSION_BASE_ROTATION_MS` | Low-risk biometric/OTP re-entry window (ms). Default **30 days**. | Default, or a small value (e.g. `60000`) to exercise step-up UI. | Default `2592000000` (30d) or slightly shorter for QA. | Default 30d. |
| `SESSION_SHORT_ROTATION_MS` | Mid-risk shortened window (ms). Default **24 hours**. | Default or `300000` (5m) for QA. | Default 24h. | Default 24h. |
| `SESSION_BIOMETRIC_FAIL_FORCE_OTP` | Failed biometric attempts before preferring OTP. | `3` (default) or `1` for QA. | `3` | `3` |

There is **no separate env flag** to disable the risk evaluator: it always runs on refresh for mobile clients. High-risk signals (backup restore, device change, repeated biometric fails, etc.) force OTP step-up.

Mobile gating is **code-based** (`mobile-client.helper.ts` + `/mobile/auth` routes), not an env toggle.

### Device attestation

| Variable | Purpose | Local | Staging | Production |
|----------|---------|-------|---------|------------|
| `DEVICE_ATTESTATION_MODE` | `off` \| `mock` \| `enforce`. Controls whether refresh/step-up require `X-Device-Attestation`. | **`off`** (default). Use **`mock`** only when testing the header path with Flutter debug mock tokens (`novasafe-mock-attest:valid…`). | Prefer **`mock`** until Play/Apple credentials and real devices are validated; then **`enforce`** on a canary. | **`enforce`**. |
| `ANDROID_PACKAGE_NAME` | Expected Android application id in Play Integrity payload. | `io.novasafe.mobile` (default) | Same as release package. | `io.novasafe.mobile` (or the live Play package). |
| `ANDROID_ATTESTATION_CERT_DIGESTS` | Optional comma-separated Play Integrity `certificateSha256Digest` allowlist. | Empty (skip allowlist). | Upload-key / debug digests used by staging builds. | Production signing cert digests only. |
| `ANDROID_REQUIRE_DEVICE_INTEGRITY` | When not `false`, require `MEETS_DEVICE_INTEGRITY` (or stronger). | `true` (default) if enforcing; irrelevant when `off`. | `true` | `true` (set `false` only with explicit security review). |
| `APPLE_IOS_BUNDLE_ID` / `IOS_BUNDLE_IDENTIFIER` | Expected iOS bundle id (also used for Sign in with Apple audiences). | `io.novasafe.mobile` | Same as TestFlight/App Store id. | Live App Store bundle id. |
| `APPLE_TEAM_ID` | Apple Developer Team ID (DeviceCheck JWT issuer). | Empty if mode `off`/`mock`. | Staging team id. | Production team id. |
| `APPLE_DEVICECHECK_KEY_ID` | Key id for the DeviceCheck private key in Apple Developer. | Empty if not enforcing iOS DeviceCheck. | Staging key id. | Production key id. |
| `APPLE_DEVICECHECK_PRIVATE_KEY` | PKCS8 private key (PEM or raw base64 body). | Empty / never commit. | From secret manager. | From secret manager. |
| `APPLE_DEVICECHECK_PRODUCTION` | `true` → `api.devicecheck.apple.com`; else development host. | `false` | `false` until using production DeviceCheck. | `true`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google service account JSON with Play Integrity scope (used by `google-auth-library`). | Unset when mode `off`/`mock`. | Path or cloud secret mount for staging SA. | Path or workload identity for prod SA. |

**Mode cheat sheet**

| Mode | When to use |
|------|-------------|
| `off` | Local dev, CI unit tests, environments without mobile attestation. Refresh/step-up skip attestation. |
| `mock` | Integration tests / staging without real Play/Apple; Flutter **debug** sends mock envelopes. Rejects missing/invalid tokens for mobile. |
| `enforce` | Real devices + store builds. Decodes Play Integrity; validates DeviceCheck / App Attest paths. Requires Google SA + Apple credentials as applicable. |

Header: `X-Device-Attestation` (base64url JSON envelope). Legacy trust header `x-client-attestation` is also accepted by the verifier.

### Email / OTP (step-up codes)

OTP **TTL / cooldown / max attempts** for session step-up are currently **code defaults** in `auth.config.ts` (not env-tunable): TTL **10 minutes**, resend cooldown **30s**, max verify attempts **8**.

| Variable | Purpose | Local | Staging | Production |
|----------|---------|-------|---------|------------|
| `RESEND_API_KEY` | Resend API key for OTP / auth emails (including session step-up). | Test key or empty (send may fail → user-facing error). | Staging Resend key. | Production Resend key. |
| `RESEND_FROM` / `SMTP_FROM` | Default “from” fallback used by onboarding-style mail. | `onboarding@example.test` or your verified domain. | Verified staging domain. | Verified production domain. |
| `RESEND_FROM_DEFAULT` | Operational default from-address. | Optional | Optional | e.g. `no-reply@your-domain` |
| `RESEND_FROM_TWO_FACTOR` | From-address for 2FA-style mail if overridden. | Optional | Optional | Optional |
| `RESEND_FROM_SIGNUP` / `RESEND_FROM_PASSWORD_RESET` | Signup / reset from overrides. | Optional | Optional | Optional |

Session step-up email uses the auth email sender (`sendSessionStepUpOTPEmail`). Ensure the Resend domain is verified in each environment before relying on OTP fallback.

### Related OAuth audiences (mobile identity)

Not introduced solely by PR #222, but required for real mobile login that issues sessions:

| Variable | Purpose | Local | Staging | Production |
|----------|---------|-------|---------|------------|
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` | Google ID token audiences. | Dev OAuth clients. | Staging clients. | Production clients matching Play package. |
| `APPLE_SIGNIN_AUDIENCE` | Extra Apple Sign In audience if distinct from bundle id. | As needed | As needed | As needed |

---

## Example snippets (placeholders only)

### Local development

```bash
JWT_SECRET=local-dev-only-replace-me
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=90d
DEVICE_ATTESTATION_MODE=off
# SESSION_BASE_ROTATION_MS=60000   # optional: force step-up often while testing UI
RESEND_API_KEY=re_xxxxxxxx_local_or_empty
```

### Staging (attestation dry-run)

```bash
JWT_SECRET=<staging-jwt-secret>
DEVICE_ATTESTATION_MODE=mock
ANDROID_PACKAGE_NAME=io.novasafe.mobile
APPLE_IOS_BUNDLE_ID=io.novasafe.mobile
RESEND_API_KEY=<staging-resend-key>
RESEND_FROM=noreply@staging.example.com
```

### Staging / production (enforce)

```bash
JWT_SECRET=<production-jwt-secret>
DEVICE_ATTESTATION_MODE=enforce
ANDROID_PACKAGE_NAME=io.novasafe.mobile
ANDROID_ATTESTATION_CERT_DIGESTS=<play-integrity-cert-digest-1>,<digest-2>
ANDROID_REQUIRE_DEVICE_INTEGRITY=true
APPLE_IOS_BUNDLE_ID=io.novasafe.mobile
APPLE_TEAM_ID=<APPLE_TEAM_ID>
APPLE_DEVICECHECK_KEY_ID=<KEY_ID>
APPLE_DEVICECHECK_PRIVATE_KEY=<PEM_OR_BASE64_PRIVATE_KEY>
APPLE_DEVICECHECK_PRODUCTION=true
GOOGLE_APPLICATION_CREDENTIALS=/secrets/play-integrity-sa.json
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=90d
SESSION_BASE_ROTATION_MS=2592000000
SESSION_SHORT_ROTATION_MS=86400000
SESSION_BIOMETRIC_FAIL_FORCE_OTP=3
RESEND_API_KEY=<production-resend-key>
```

---

## Production checklist

- [ ] `JWT_SECRET` set, unique to production, stored in secret manager (not in git / Terraform plain text).
- [ ] `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` reviewed against product policy.
- [ ] `DEVICE_ATTESTATION_MODE=enforce` after real-device validation on staging.
- [ ] Google Play Integrity: Cloud project linked; service account can call `decodeIntegrityToken`; `GOOGLE_APPLICATION_CREDENTIALS` (or equivalent workload identity) configured.
- [ ] `ANDROID_PACKAGE_NAME` and `ANDROID_ATTESTATION_CERT_DIGESTS` match the Play Store signing certs.
- [ ] Apple: App Attest capability enabled; DeviceCheck key created; `APPLE_TEAM_ID`, `APPLE_DEVICECHECK_KEY_ID`, `APPLE_DEVICECHECK_PRIVATE_KEY`, `APPLE_DEVICECHECK_PRODUCTION=true`.
- [ ] `APPLE_IOS_BUNDLE_ID` / `IOS_BUNDLE_IDENTIFIER` match the App Store app.
- [ ] Resend (or SMTP) domain verified; step-up OTP email deliverable.
- [ ] Confirm web/extension login still returns **no** refresh token; only `/mobile/auth/refresh` and `/mobile/auth/session/step-up/*` expose continuity APIs.
- [ ] Monitor for `ATTESTATION_REQUIRED` / `ATTESTATION_INVALID` / `DEVICE_BINDING_MISMATCH` spikes after cutover.
- [ ] Rollback plan: set `DEVICE_ATTESTATION_MODE=off` or `mock` if attestation providers outage blocks legitimate users (temporary; track as security exception).

---

## See also

- Core env template: [`services/core/.env.example`](../../services/core/.env.example)
- Security docs index: [`docs/security/README.md`](../security/README.md)
- PR: [novasafe-backend#222](https://github.com/novasafe-org/novasafe-backend/pull/222)
