# C-01 — Mobile API runs `services/core` (cutover runbook)

**Status:** Production verified **2026-06-26** — `https://mobile-api.novasafe.io` returns `"service":"core"`.

The legacy `services/mobile_vault` codebase is **removed**. CI builds **`services/core`** → `ghcr.io/novasafe-org/novasafe-mobile-vault:latest`. The image name is historical; the running process is **core**.

---

## Verify anytime

```bash
./scripts/smoke-mobile-api.sh
# or
curl -sS https://mobile-api.novasafe.io/mobile/health | jq .
curl -sS https://mobile-api.novasafe.io/version | jq .
```

**Pass criteria:**

- `"service": "core"` in health JSON (not a separate legacy binary)
- `"success": true` and database ping ok
- `/version` shows expected `commit` after you deploy

---

## Deploy latest core to production

1. Push to `main` on `novasafe-backend` (triggers `backend-deploy` → `mobile-api-deploy`), **or** run **Actions → Build & Deploy Mobile API (manual)**.
2. On VPS, deploy pulls the new image:

```bash
cd /opt/novasafe-deployment/mobile-api   # or /opt/novasafe/mobile-api
./deploy.sh mobile-api                   # from novasafe-deployment repo
```

3. Run smoke test (from laptop or VPS):

```bash
curl -sS https://mobile-api.novasafe.io/version
./scripts/smoke-mobile-api.sh
```

4. Spot-check: login, vault list, extension sync, RC webhook path still reachable.

---

## Rollback

```bash
cd /opt/novasafe-deployment/mobile-api
# Pin previous image (use sha from GHCR Packages)
export IMAGE_TAG=<previous-sha>
docker compose pull
docker compose up -d
```

Or in `docker-compose.yml` temporarily:

```yaml
image: ghcr.io/novasafe-org/novasafe-mobile-vault:<previous-sha>
```

Reload nginx only if upstream host/port changed:

```bash
cd /opt/novasafe-deployment/infra/nginx
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

---

## Architecture (current)

```text
Clients → mobile-api.novasafe.io → nginx → novasafe-mobile-vault:3124
                                              ↑
                              Docker image built from services/core
```

Port **3124** in production is intentional (Dockerfile `CORE_PORT=3124`). Local dev uses **3125** — same code, different port.

---

## Optional cleanup (not required for C-01)

| Item | Note |
|------|------|
| Rename container `novasafe-mobile-vault` → `novasafe-core` | Requires nginx + compose + deploy.sh together |
| Standardize prod port to 3125 | Coordinated compose + nginx change |
| Rename GHCR image `novasafe-mobile-api` | Breaking for existing deploy scripts |

---

## Closes

- **C-01** — prod serves hardened `core`
- **C-02** — password history redaction lives in `core` (`password-version-access.ts`); **verified** — free users do not see history
