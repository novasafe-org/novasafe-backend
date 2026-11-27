# Device fingerprinting & silent session resume

Industry-standard layered trust for NovaSafe mobile. The allow-login prompt remains the fallback when identity cannot be proven.

## Layers

| Layer | Purpose | Survives reinstall? |
|---|---|---|
| **1. Install device key** (`X-Device-Id`) | Per-install UUID in secure storage (existing) | No (new UUID after wipe) |
| **2. Hardware fingerprint** (`X-Device-Fingerprint`) | Stable hash from ANDROID_ID / identifierForVendor + platform + app id | Yes until factory reset / all-vendor-apps removed |
| **3. Device trust token** | Short-lived server-issued secret in Keychain / EncryptedSharedPrefs | Best-effort (iOS Keychain ThisDeviceOnly may persist; Android wipe clears it) |
| **4. Approval prompt** | It’s me / Not me on a trusted device (existing) | N/A — human fallback |

## Happy paths

1. **Same install** — refresh token + validateSession (unchanged).
2. **Reinstall, same phone, trust token present** — `POST /mobile/auth/device/silent-resume` with trust token + hardware fingerprint → new session, no consent UI.
3. **Reinstall, fingerprint matches a trusted device, no trust token** — next login treats device as already trusted via fingerprint match (no consent); still needs credentials / OAuth.
4. **Unknown hardware** — existing pending-consent / force-replace flows.

## Edge cases (standing rule)

| Case | Behavior |
|---|---|
| **Reinstall** | New install UUID; fingerprint + trust token drive silent resume when possible. |
| **Multi-device** | Trust is per `(userId, deviceKey\|hardwareFingerprint)`. Other devices unchanged. Free/single-device limits still apply. |
| **Token expiry** | Access/refresh expire as today. Trust token TTL (default 90d) → silent resume fails → full login; fingerprint may still skip consent. |
| **Fingerprint mismatch** | Trust token rejected (`DEVICE_FINGERPRINT_MISMATCH`). Do not issue session. Fall back to login + consent. |
| **Compromised / Not-me / revoke** | Mark device `compromisedAt` / deactivate; clear trust token hash; reject silent resume. |
| **Backup restore (new hardware)** | Install-marker heuristic + fingerprint mismatch → no silent resume; step-up / consent. |
| **Spoofed `X-Device-Id` alone** | Insufficient — trust requires fingerprint (+ token for silent resume). |

## API (scaffold)

- `POST /mobile/auth/device/silent-resume` — body: `{ trustToken }` (+ headers `X-Device-Id`, `X-Device-Fingerprint`).
- Auth success may include `deviceTrust: { token, expiresAt }` when the device is trusted.
- TrustedDevice fields: `hardwareFingerprint`, `trustTokenHash`, `trustExpiresAt`, `compromisedAt`.

## Rollout

1. **Scaffold (this change)** — schema, helpers, silent-resume endpoint, mobile fingerprint + trust store + headers.
2. **Wire** — persist trust on login/consent; cold-start silent resume; mark compromised on Not-me/revoke.
3. **Harden** — bind trust issuance to attestation; rotate trust token on every resume; metrics/alerts.
