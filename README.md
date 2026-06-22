# NovaSafe Backend

pnpm monorepo for NovaSafe production APIs. Two deployable services live under `services/`:

| Service | Path | Default port | Production image | Public URL |
|---------|------|--------------|------------------|------------|
| **Mobile API** (core) | `services/core` | `3125` | `ghcr.io/novasafe-org/novasafe-mobile-vault` | `api.novasafe.io` |
| **Admin API** (admin-app) | `services/admin-app` | `3130` | `ghcr.io/novasafe-org/novasafe-admin-api` | `admin-api.novasafe.io` |

The mobile app, browser extension, and public status page talk to **core**. The NovaSafe admin panel (Netlify) talks to **admin-app**.

---

## Repository layout

```
novasafe-backend/
├── services/
│   ├── core/          # Mobile API — auth, vault, subscriptions, status page
│   └── admin-app/     # Admin API — RBAC, blog, changelog, status admin proxy
├── .github/workflows/ # CI/CD (build images, deploy to VPS)
├── package.json       # Workspace root scripts
└── pnpm-workspace.yaml
```

Other workspace packages may exist for legacy or local tooling; **core** and **admin-app** are the services deployed to production.

---

## Mobile API (`services/core`)

Unified backend for NovaSafe mobile and extension clients. Express + MongoDB (Mongoose).

### Modules

- **auth** — login, sessions, OAuth, device trust, onboarding
- **vault** — passwords and secure items
- **subscriptions** — RevenueCat webhooks and entitlements
- **sharing** — shared vault items
- **settings** — user preferences and sync
- **dashboard** — aggregated client data
- **status-page** — public status endpoints and admin-protected incident APIs
- **platform** — app metadata and feature flags
- **docs** — API documentation routes

### API prefix

Routes mount under `/api/v1` (plus legacy `/mobile/*` paths where applicable).

### Local development

```bash
pnpm install
cp services/core/.env.example services/core/.env   # fill in JWT_SECRET, MongoDB, etc.
pnpm run start:core
```

Health: `GET /health` or `GET /api/v1/health`

More detail: [services/core/README.md](services/core/README.md)

---

## Admin API (`services/admin-app`)

Backend for the NovaSafe admin panel. Express + native MongoDB driver. Handles internal operations that should not live on the public mobile API.

### Modules

- **rbac** — admin auth, JWT sessions, roles (owner / admin / member), team invites, password reset
- **blog** — posts, categories, tags, media, SEO feeds (ported from the Vercel blog API)
- **changelog** — product release notes
- **status** — proxies status-page admin operations to core via `CORE_API_URL`
- **templates** — email/template stubs (future use)

### Key routes

All routes use prefix `/api/v1`:

| Area | Examples |
|------|----------|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/forgot-password` |
| Team / RBAC | `GET /rbac/matrix`, `GET /team/members`, `POST /team/invites` |
| Changelog | `GET/POST /changelog` |
| Status (proxy) | `/status/*` → core mobile API |
| Blog | `/posts`, `/categories`, `/tags`, `/media`, `/seo` |

### Local development

```bash
pnpm install
cp services/admin-app/.env.example services/admin-app/.env
pnpm run start:admin
```

Seed the bootstrap owner (uses `ADMIN_OWNER_*` from `.env`):

```bash
pnpm --filter admin-app-service run seed
```

Health: `GET /health` or `GET /api/v1/health`

### CORS

The admin UI runs on a different origin (e.g. `https://ns-admin.netlify.app`). Set `ADMIN_CORS_ORIGINS` to a comma-separated list of allowed UI URLs. Without the correct origin, the browser blocks login with a CORS error.

---

## How the services relate

```
┌─────────────────────┐         ┌─────────────────────┐
│  Mobile / Extension │────────▶│  core (Mobile API)  │
└─────────────────────┘         │  api.novasafe.io    │
                                └──────────┬──────────┘
                                           │ blog proxy (internal)
┌─────────────────────┐         ┌──────────▼──────────┐
│  Marketing landing  │────────▶│  admin-app          │
│  (blog reads only   │  via    │  (Admin API)        │
│   through core)     │  core   │  internal :3130     │
└─────────────────────┘         └──────────▲──────────┘
                                           │
┌─────────────────────┐                    │ direct Mongo + status proxy
│  Admin panel (UI)   │────────────────────┘
│  Netlify            │
└─────────────────────┘
```

- **Customer users** — admin-app reads `vaultUsers` (and related collections) directly from MongoDB. No core proxy.
- **Blog (public)** — landing calls `GET /api/v1/blog/*` on **core**; core proxies to admin-api on the Docker network (`ADMIN_API_URL`). Admin-api is not exposed to browsers for blog reads.
- **Status admin** — admin-app proxies to core with `STATUS_PAGE_ADMIN_SECRET`.

Both services share the same MongoDB cluster but use different collections.

---

## Root scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run start:core` | Run mobile API in dev (tsx watch) |
| `pnpm run start:admin` | Run admin API in dev |
| `pnpm run build:core` | Compile core TypeScript |
| `pnpm run build:admin` | Compile admin-app TypeScript |
| `pnpm run build:all` | Build every workspace package |

---

## Environment variables

Copy the `.env.example` in each service directory. Never commit `.env` files.

**Core** — `services/core/.env.example`  
JWT, MongoDB, RevenueCat, Resend, status-page secrets, OAuth, etc.

**Admin** — `services/admin-app/.env.example`  
MongoDB, `ADMIN_JWT_SECRET`, `ADMIN_CORS_ORIGINS`, `ADMIN_PANEL_URL`, `CORE_API_URL`, `STATUS_PAGE_ADMIN_SECRET`, Resend.

Production env files live on the VPS under `novasafe-deployment` (`platform/mobile-api/.env`, `platform/admin-api/.env`).

---

## Deployment

CI/CD is in `.github/workflows/backend-deploy.yml`:

1. Detects which service changed (`services/core/**` vs `services/admin-app/**`)
2. Builds and pushes Docker images to GHCR
3. Triggers deploy in the [novasafe-deployment](https://github.com/novasafe-org/novasafe-deployment) repo

Manual deploy: GitHub Actions → **NovaSafe Backend Deploy** → choose `admin-api only`, `mobile-api only`, or `both services`.

Required GitHub secrets: `SSH_USER`, `SSH_HOST`, `SSH_PASSWORD`, `DEPLOY_PATH`.

See also [README_DEPLOYMENT.md](README_DEPLOYMENT.md) for legacy setup notes.

---

## Requirements

- Node.js 20+
- pnpm 8+
- MongoDB (local or Atlas)
