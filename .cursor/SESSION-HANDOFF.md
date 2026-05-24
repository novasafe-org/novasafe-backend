# NovaSafe Core Migration — Cursor Session Handoff

**Purpose:** Continue development on another machine without this chat history.  
**Repo:** `novasafe-backend` (monorepo)  
**Date context:** May 2026  
**Rule:** Do **not** modify `services/mobile_vault` unless explicitly asked — migration target is `services/core`.

---

## 1. High-level goal

Build a unified **`services/core`** backend that eventually replaces `mobile_vault`, while keeping **legacy `/mobile/*` routes** so existing mobile clients keep working during cutover. Add an enterprise **API Playground** (`services/api-playground`) using **Scalar** (not basic Swagger UI).

---

## 2. What was built

### 2.1 Core service (`services/core`)

| Area | Status | Notes |
|------|--------|--------|
| Express app, Mongoose DB, modular routes | Done | Port **3125**, `BIND_HOST=0.0.0.0` |
| Auth (login, OAuth, 2FA, sessions, onboarding) | Done | JWT compatible with mobile_vault (`issuer: vault-backend`, 7d access) |
| Request context | Done | `src/shared/request-context/` — headers, trace IDs, ALS |
| Trust layer | Done | `src/shared/trust/` — non-blocking by default (`TRUST_ENFORCE_BLOCKING=false`) |
| OpenAPI | Done | `src/openapi/`, `GET /api/v1/openapi.json`, modular `*.openapi.ts` |
| Vault | Done | Port of `mobileVaultService` + routes |
| Settings | Done | Port of `mobileSettingsController` |
| Subscriptions + RevenueCat | Done | Full `revenuecat/` folder + webhook |
| Dashboard | Done | Overview + security summary |
| Sharing | Done | List + send invite |
| Platform | Done | `GET /mobile/app/version` (public) |
| Crypto | Done | `src/shared/crypto/vault-crypto.ts` — must match mobile_vault keys |

**Entry:** `services/core/src/index.ts` → `loadEnv.ts` → `server.ts` → `app.ts`  
**Module registration:** `services/core/src/modules/index.ts`

### 2.2 API Playground (`services/api-playground`)

- **Scalar UI** at `/docs` (port **5200** default)
- Proxies API to core via `/api/playground/proxy/*`
- OpenAPI fetched from core, servers rewritten to same-origin proxy
- Features: client profiles (`MOBILE_ANDROID`, etc.), env switching, auth vault, request history, curl export
- Research doc: `services/api-playground/docs/PLATFORM-RESEARCH.md`

### 2.3 Monorepo scripts

Root `package.json`:

- `pnpm run start:core` → core dev
- `pnpm run start:playground` → playground dev
- `pnpm run stop:core` / `stop:playground` → free ports
- `scripts/free-port.mjs` — kills listeners before `predev` (fixes `EADDRINUSE` on 5100/3125)

### 2.4 Database

- **Same Atlas DB as mobile_vault:** database name `vault`
- Core accepts **both** naming styles:
  - `MONGO_*` (preferred in core `.env`)
  - `VAULT_DB_*` (mobile_vault aliases) — see `services/core/src/database/config/database.config.ts`
- Collections aligned in `services/core/src/database/collections.ts` (e.g. `mobilePasswordVersions`, `vaultItems`)

---

## 3. Route map (legacy + v1)

All legacy paths mirror `mobile_vault` `app.ts` mounting.

| Legacy prefix | Core module | API v1 prefix |
|---------------|-------------|---------------|
| `/mobile/auth` | auth | `/api/v1/auth` |
| `/mobile/onboarding` | auth (onboarding) | `/api/v1/onboarding` |
| `/mobile/vault` | vault | `/api/v1/vault` |
| `/mobile/settings` | settings | `/api/v1/settings` |
| `/mobile/subscriptions` | subscriptions | `/api/v1/subscriptions` |
| `/mobile/dashboard` | dashboard | `/api/v1/dashboard` |
| `/mobile/share` | sharing | `/api/v1/share` |
| `/mobile/app` | platform | — |
| `/mobile/security/summary` | dashboard | also under dashboard |
| — | docs | `/api/v1/openapi.json` |

**Health:** `GET /health`, `GET /api/v1/health`

### Vault routes (from `vaultRoute.ts`)

`revision`, `items` CRUD, custom fields, password versions (Pro entitlement), `sync/bulk-upload`, `sync/pull`

### Settings routes (from `settingsRoute.ts`)

Settings, sync, passwords, 2FA, sessions, export/import CSV (Pro), account deletion

### Subscription routes

`state`, `sync`, `offerings`, `membership`, `debug`, `webhook/revenuecat`

---

## 4. Key file paths

```
services/core/
  .env                    # synced from mobile_vault (DO NOT COMMIT)
  .env.example            # documented template
  src/modules/
    auth/
    vault/
    settings/
    subscriptions/        # services + revenuecat/
    dashboard/
    sharing/
    platform/
    docs/
  src/openapi/
  src/shared/crypto/
  src/shared/request-context/
  src/shared/trust/
  src/database/

services/api-playground/
  .env.example
  src/                    # proxy, Scalar, history, etc.

scripts/free-port.mjs
```

---

## 5. Environment variables (core)

**Synced from `services/mobile_vault/.env` into `services/core/.env`.**

Critical:

| Variable | Purpose |
|----------|---------|
| `CORE_PORT=3125` | Core HTTP port (user chose 3125, not mobile’s 3124) |
| `BIND_HOST=0.0.0.0` | LAN access from other devices |
| `JWT_SECRET` | Must match mobile_vault for shared tokens |
| `MONGO_*` or `VAULT_DB_*` | Atlas `vault` database |
| `MOBILE_VAULT_MASTER_KEY` / `SERVER_MASTER_KEY` | Vault field encryption — **must match** mobile_vault |
| `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` | OAuth |
| `RESEND_API_KEY`, `RESEND_FROM` | Email / OTP |
| `REVENUECAT_*` | Subscriptions (`REVENUECAT_SECRET_API_KEY` = API key) |
| `FREE_PLAN_MAX_PASSWORDS`, `FREE_PLAN_MAX_SECURE_NOTES`, `FREE_PLAN_MAX_DEVICES` | Plan limits |
| `LOG_LEVEL` | mobile had `debug`; `http` shows per-request access lines |

**LAN URL for other laptops:** `http://<host-mac-lan-ip>:3125` (not `127.0.0.1`).

**Playground** should use `CORE_API_URL=http://<ip>:3125` if testing from another machine.

**Not wired in core yet (vars kept for parity):** `PAYU_*`, `RAZORPAY_*`

---

## 6. How to run

```bash
# From repo root
pnpm install

# Core (frees port 3125, then starts)
pnpm run stop:core
pnpm run start:core

# API Playground (optional, port 5200)
pnpm run start:playground
```

- Core docs UI: N/A (use playground)
- Playground Scalar: http://127.0.0.1:5200/docs
- Core OpenAPI: http://127.0.0.1:3125/api/v1/openapi.json

---

## 7. Issues resolved in session

### 7.1 `EADDRINUSE` on core port

**Cause:** Orphaned `tsx watch` / Node processes still listening after closing terminal.  
**Fix:** `scripts/free-port.mjs` + `predev`/`stop:core` in `services/core/package.json`. Improved `stopServer()` with `closeAllConnections()`.

### 7.2 No logs on failed login in core terminal

**Cause:** HTTP access logs use Winston level `http` (priority 4); default `LOG_LEVEL=info` (3) filters them out. Failed login has **no** explicit business log in `SignInService`.  
**Fix (operational):** Set `LOG_LEVEL=http` to see request lines. Not a bug — request reached core (401 body proves it).

### 7.3 MongoDB partial indexes

Earlier session: use `{ deleted: false }` not `$ne` in partial filters; `syncIndexes()` not `createIndexes()`.

---

## 8. Architecture decisions

1. **Scalar** over Swagger UI for playground (`@scalar/express-api-reference`).
2. **Native Mongo adapter** (`database/adapters/native-mongo.adapter.ts`) for vault/settings logic ported from mobile_vault’s `Database` class — same collections, via Mongoose connection.
3. **Subscription logic** in `modules/subscriptions/` — auth `subscription.adapter.ts` re-exports from there (avoid duplicate `assertEntitlement`).
4. **Legacy routes** preserved under `/mobile/*` for zero client change during migration.
5. **OpenAPI** modular: add `src/openapi/modules/*.openapi.ts`, register in `openapi.builder.ts`.

---

## 9. Git / commit (user was preparing first push)

Suggested commit message:

```
feat(core): add unified NovaSafe core backend service

Introduce services/core with auth, vault, settings, subscriptions,
dashboard, and sharing; legacy /mobile/* routes; OpenAPI; request context
and trust layer. Add api-playground for Scalar-based API exploration.
```

**Do not commit:** `services/core/.env`, `services/api-playground/.env`  
**Do commit:** `.env.example`, all source, `pnpm-lock.yaml`, `package.json` scripts

---

## 10. Not done / follow-ups

| Item | Notes |
|------|--------|
| OpenAPI for vault/settings/subscriptions | Partial — auth + some vault paths only |
| `getDashboardStats` in service | Implemented but not exposed as separate route beyond dashboard |
| PayU / Razorpay in core | Env vars only |
| WebSocket explorer | Stub in playground |
| GraphQL / analytics | Stubs / future |
| Wire trust blocking in production | Config ready, default off |
| Deprecate / remove `mobile_vault` | Out of scope |
| CI/Docker deploy for core | Dockerfile exists; workflow may need update |
| Extend OpenAPI for all new modules | Recommended next step |

---

## 11. Testing checklist (other laptop)

1. Copy repo, `pnpm install`, copy `.env` securely (not via git).
2. `pnpm run start:core` → health `http://127.0.0.1:3125/health`
3. Login: `POST /mobile/auth/login` or `/api/v1/auth/login` with real vault user.
4. Vault: `GET /mobile/vault/items` with Bearer token.
5. Settings: `GET /mobile/settings`
6. Subscriptions: `GET /mobile/subscriptions/state`
7. From phone/other laptop: `http://<lan-ip>:3125/mobile/health`

---

## 12. How to use this file in Cursor (other laptop)

1. Clone/pull repo.
2. Open project in Cursor.
3. New Agent chat:  
   `@.cursor/SESSION-HANDOFF.md`  
   “Continue NovaSafe core migration from this handoff. [your next task]”
4. Copy `services/core/.env` manually (or recreate from `mobile_vault/.env` + `.env.example`).

---

## 13. Chat export note

- Repo `.cursor/` does **not** store chat history (this file is the handoff).
- Raw transcript (optional):  
  `~/.cursor/projects/Users-pavankumar-tidke-Projects-novasafe-cluster-novasafe-backend/agent-transcripts/3d7f1879-f048-448d-a59b-fcd56bd3e3a1/*.jsonl`

---

## 14. Original user constraints (always apply)

- Do not modify `mobile_vault` unless asked.
- Minimize scope; match existing patterns.
- Playground disabled in production by default or require API key.
- Enterprise DX — not temporary Swagger-only setup.
- Core OpenAPI consumed dynamically by playground.

---

*End of handoff — update this file when major milestones land.*
