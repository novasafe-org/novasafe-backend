# NovaSafe Backend — Cursor Session Context Summary

**Purpose:** Handoff document for continuing work on another machine or in a new Cursor chat.  
**Repo:** `novasafe-backend` (pnpm monorepo, `services/*`)  
**Transcript ID:** `3d7f1879-f048-448d-a59b-fcd56bd3e3a1` (local: `~/.cursor/projects/.../agent-transcripts/`)  
**Last updated:** 2026-05-23  

---

## How to use this on another laptop

1. Clone/pull this repo (ensure this file is included in git).
2. Open the project in Cursor.
3. Start a **new Agent chat** and say:

   > Read `.cursor/SESSION_CONTEXT.md` and continue NovaSafe core backend work from where we left off.

4. Copy `services/core/.env` separately (never commit `.env` — use `.env.example` + secrets from password manager).

---

## Product & architecture goals

- **NovaSafe** = password manager / vault platform (mobile app live today).
- **Monorepo** at repo root: `pnpm-workspace.yaml` → `services/*`.
- **Legacy service:** `services/mobile_vault` — still runs; **do NOT modify** unless explicitly asked.
- **New unified backend:** `services/core` — modular monolith replacing `mobile_vault` over time.
- **Future clients:** mobile, web, extension, desktop, admin, public API.
- **API Playground:** `services/api-playground` — Scalar-based DX layer (port **5200**), proxies to core.

---

## Hard rules (always)

| Rule | Detail |
|------|--------|
| Do not touch `mobile_vault` | Unless user explicitly requests |
| Same MongoDB database | Core uses Atlas DB name **`vault`** (same as mobile_vault) |
| JWT compatibility | Issuer `vault-backend`, 7d access token, compatible with mobile_vault sessions |
| Encryption keys | `MOBILE_VAULT_MASTER_KEY` + `SERVER_MASTER_KEY` must match mobile_vault for existing encrypted items |
| Do not commit secrets | Only `.env.example`; keep real `.env` local |

---

## What was built in `services/core`

### Infrastructure

| Area | Location | Notes |
|------|----------|--------|
| Entry | `src/index.ts` → `loadEnv.ts` → `server.ts` → `app.ts` | |
| Config | `src/config/`, `src/config/auth.config.ts` | |
| DB layer | `src/database/` | Mongoose, `ConnectionManager`, repositories, schemas |
| Logging | `src/shared/logger/` | Winston, dev=console, prod/container=file-only |
| Request context | `src/shared/request-context/` | ALS, trace IDs, `x-client-source`, etc. |
| Trust layer | `src/shared/trust/` | Declared vs verified source; non-blocking by default |
| Crypto | `src/shared/crypto/vault-crypto.ts` | AES-256-GCM, same as mobile_vault |
| Native Mongo | `src/database/adapters/native-mongo.adapter.ts` | For ported services using raw driver on same connection |

### Modules (registered in `src/modules/index.ts`)

| Module | API prefix | Legacy mobile path | Status |
|--------|------------|-------------------|--------|
| **docs** | `/api/v1/openapi.json` | — | OpenAPI builder |
| **platform** | — | `/mobile/app/version` | App version check |
| **auth** | `/api/v1/auth/*` | `/mobile/auth/*` | Login, OAuth, 2FA, session, logout |
| **onboarding** | `/api/v1/onboarding/*` | `/mobile/onboarding/*` | Email OTP signup |
| **vault** | `/api/v1/vault/*` | `/mobile/vault/*` | Items, sync, custom fields, password history |
| **settings** | `/api/v1/settings/*` | `/mobile/settings/*` | Profile, 2FA, sessions, export/import, delete account |
| **dashboard** | `/api/v1/dashboard/*` | `/mobile/dashboard/*` | Overview + security summary |
| **sharing** | `/api/v1/share/*` | `/mobile/share/*` | List/send share invites |
| **subscriptions** | `/api/v1/subscriptions/*` | `/mobile/subscriptions/*` | RevenueCat state, webhook, offerings |
| **users** | placeholder | — | Scaffold only |

### Auth migration highlights

- Full auth from `mobile_vault` → `src/modules/auth/` (controllers, services, repositories, JWT, Google/Apple OAuth, onboarding).
- **No refresh token** in mobile_vault style — 7-day JWT + session row in `sessions` collection.
- Login paths: `POST /api/v1/auth/login` and `POST /mobile/auth/login`.
- Middleware: `authMiddleware`, `oauthPendingAuthMiddleware`, `sessionOrPendingAuthMiddleware` — exported from `modules/auth`.

### Request flow (login example)

1. `app.ts` — `express.json` → `requestContextMiddleware` → CORS → `applyExpressLogging` → routes.
2. `POST /api/v1/auth/login` → `auth.routes` → `auth.controller.login` → `SignInService.login`.
3. Global middleware sets `x-request-id`, `x-trace-id`, parses `x-client-source`, runs trust evaluation.
4. On success: `AuthResponseService.buildFullSession` (JWT + session document).

### Vault module

- Ported `mobileVaultService` → `modules/vault/services/vault-items.service.ts`.
- Controllers/routes mirror `mobile_vault/src/routes/vaultRoute.ts`.
- Subscription limits via `assertCanCreateVaultItem` from subscriptions service.

### Settings module

- Ported `mobileSettingsController` → `modules/settings/controllers/settings.controller.ts`.
- Sync, 2FA, sessions, CSV export/import, account deletion, master/login password.

### Subscriptions module

- Ported RevenueCat stack: `modules/subscriptions/revenuecat/*`, `subscription.service.ts`, `revenue-cat.service.ts`.
- Webhook: `POST /api/v1/subscriptions/webhook/revenuecat` (and `/mobile/subscriptions/...`).
- Indexes ensured on DB startup via `ensureSubscriptionIndexes`.

### API Playground (`services/api-playground`)

- **Scalar** UI at `/docs` (not basic Swagger UI).
- Proxies API to core: `/api/playground/proxy/*` with platform header injection.
- Features: env switcher, client profiles (`MOBILE_ANDROID`, `WEB_APP`, etc.), auth vault, request history, curl export.
- Default core target in config: `http://127.0.0.1:3125`.

---

## Runtime configuration

### Core port & LAN access

| Variable | Value | Notes |
|----------|-------|--------|
| `CORE_PORT` | **3125** | User chose 3125 (mobile_vault was 3124) |
| `BIND_HOST` | `0.0.0.0` | Allows other laptops on LAN |
| `BACKEND_URL` | `http://192.168.1.36:3125` | Update IP to host machine |

**From another device on same Wi‑Fi:**

```text
http://<HOST_LAN_IP>:3125/health
http://<HOST_LAN_IP>:3125/mobile/auth/login
http://<HOST_LAN_IP>:3125/api/v1/vault/items
```

Find IP: `ipconfig getifaddr en0`

### MongoDB

Core reads **either** naming convention:

- `MONGO_DB_NAME`, `MONGO_HOST`, `MONGO_USER`, `MONGO_PASSWORD`
- `VAULT_DB_NAME`, `VAULT_DB_HOST`, `VAULT_DB_USERNAME`, `VAULT_DB_PASSWORD`

Database: **`vault`** on Atlas (`vault-cluster.chu49ca.mongodb.net`).

### Start commands (repo root)

```bash
pnpm run start:core          # core on 3125
pnpm run stop:core           # frees port via scripts/free-port.mjs
pnpm run start:playground    # api-playground on 5200
```

Core package: `pnpm --filter core-service run dev` (runs `predev` → frees port).

---

## Logging — important gotcha

- HTTP access logs use Winston level **`http`** (`logger.request()`).
- Default `LOG_LEVEL=info` **hides** HTTP lines (only error/warn/info/success show).
- Failed login returns **401 with no business log** in `SignInService` — only middleware would log the request.
- **To see every request in terminal:** `LOG_LEVEL=http` or `debug` in `services/core/.env`.
- Production/container: `LOG_ENABLE_CONSOLE=false`, `LOG_ENABLE_FILE=true`, logs under `LOG_DIR` (e.g. `/app/logs`).

---

## Fixes applied this session

### `EADDRINUSE :5100` / port in use

- **Cause:** Orphaned `tsx`/Node processes after background starts or terminal close; old listeners on 5100/3125.
- **Fix:** `scripts/free-port.mjs` + `predev`/`stop:core` in `services/core/package.json`.
- **Usage:** `pnpm run stop:core` before restart.

### MongoDB partial indexes

- Use `{ deleted: false }` not `$ne` / `$exists: false` in partial filters.
- Index sync: `syncIndexes()` not `createIndexes()` on conflicting fields.

### OpenAPI

- `GET /api/v1/openapi.json` via `modules/docs`.
- Vault paths partially documented in `src/openapi/modules/vault.openapi.ts`.

---

## Environment files

| File | Purpose |
|------|---------|
| `services/core/.env` | Local secrets (gitignored) — synced from mobile_vault vars |
| `services/core/.env.example` | Documented template for all env vars |
| `services/mobile_vault/.env` | Reference only; do not commit |

**Synced into core:** JWT, Google OAuth IDs, Resend, RevenueCat, Mongo, encryption keys, free plan limits, PayU/Razorpay vars (not wired in core yet).

---

## Key file map (quick reference)

```text
services/core/
  src/index.ts, loadEnv.ts, server.ts, app.ts, shutdown.ts
  src/modules/
    auth/          # login, oauth, onboarding, middleware, JWT
    vault/         # vault-items.service, routes, controllers
    settings/      # profile, sessions, export, 2FA, delete account
    subscriptions/ # RevenueCat + entitlements
    dashboard/     # stats overview
    sharing/       # share invites
    platform/      # /mobile/app/version
    docs/          # openapi.json route
  src/shared/
    logger/
    request-context/
    trust/
    crypto/
  src/database/
  src/openapi/

services/api-playground/
  src/ui/scalar.setup.ts
  src/integrations/core/core-proxy.handler.ts

scripts/free-port.mjs
```

---

## OpenAPI / Scalar testing

1. Start core: `pnpm run start:core`
2. Start playground: `pnpm run start:playground`
3. Open: http://127.0.0.1:5200/docs
4. Requests go to: `http://127.0.0.1:5200/api/playground/proxy/api/v1/...`
5. Set headers: `x-playground-client-profile: MOBILE_ANDROID`, `Authorization: Bearer <token>`

Login works against real `vaultUsers` in shared DB when credentials are valid.

---

## Git / first push

Suggested commit message:

```text
feat(core): add unified NovaSafe core backend service

Introduce services/core with modular auth, vault, settings, subscriptions,
dashboard, and sharing; legacy /mobile/* routes; OpenAPI; request context and
trust layer. Add api-playground for Scalar-based API exploration.
```

**Do not commit:** `services/core/.env`, `services/api-playground/.env`

---

## Not implemented / future work

- [ ] PayU / Razorpay payment routes in core (env vars present only)
- [ ] WebSocket explorer in api-playground (stub exists)
- [ ] GraphQL explorer
- [ ] Full OpenAPI coverage for settings/subscriptions/dashboard
- [ ] `getDashboardStats` not exposed as separate route beyond dashboard module
- [ ] Trust layer **blocking** mode (`TRUST_ENFORCE_BLOCKING=true`) — optional hardening
- [ ] Apple Sign In full production config (placeholders in env)
- [ ] Deprecate / retire `mobile_vault` after cutover testing
- [ ] CI/CD for `services/core` Dockerfile

---

## Known issues & decisions

| Topic | Decision |
|-------|----------|
| Core vs mobile_vault port | Core **3125**, mobile_vault remains **3124** |
| Refresh tokens | Not implemented (matches mobile_vault) |
| Subscription adapter in auth | Thin re-export from `subscriptions` service |
| Chat export | Repo `.cursor/` is for **docs**; raw chat is in `~/.cursor/projects/.../agent-transcripts/` |

---

## Suggested next steps (for new chat)

1. Verify all mobile routes against mobile_vault integration tests or Postman collection.
2. Add `LOG_LEVEL=http` or explicit `logger.warn` on failed login if desired.
3. Expand OpenAPI for settings + subscriptions.
4. Wire PayU/Razorpay if payments move to core.
5. Production deploy: core Dockerfile, env secrets, `LOG_ENABLE_FILE=true`, `PLAYGROUND_ENABLED=false` in prod.

---

## Contact points in code (auth walkthrough)

When explaining login to someone new, read in order:

1. `services/core/src/index.ts`
2. `services/core/src/app.ts` (middleware order)
3. `services/core/src/shared/request-context/middleware/request-context.middleware.ts`
4. `services/core/src/modules/auth/routes/auth.routes.ts`
5. `services/core/src/modules/auth/controllers/auth.controller.ts`
6. `services/core/src/modules/auth/services/sign-in.service.ts`
7. `services/core/src/modules/auth/services/auth-response.service.ts`

---

*End of session context — attach this file to new Cursor agents for continuity.*
