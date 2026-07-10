# Deploy NovaSafe backends to AWS Lambda

Parallel path to VPS Docker. **VPS deployment is unchanged** — same `node dist/index.js`, same `.env` on the server.

Lambda uses the **same `.env` file format** as VPS. At deploy time the workflow:

1. Reads your production `.env` from a GitHub Environment secret
2. Merges Lambda-specific overrides (public URLs, logging)
3. Bundles `.env` into the zip — `loadEnv.ts` reads it at cold start (identical to Docker)

---

## One-time setup

### 1. Deploy CDK stacks

In `novasafe-deployment` → **Deploy Infrastructure** → run:

| Stack | Creates |
|-------|---------|
| **MobileApi** | Lambda `novasafe-prod-fn-mobile-api`, API GW, ACM for `mobile-api.novasafe.io` |
| **AdminApi** | Lambda `novasafe-prod-fn-admin-api`, S3 uploads bucket, ACM for `admin-api.novasafe.io` |

Add ACM DNS validation records in Cloudflare, then CNAME each API subdomain to the stack output **CustomDomainTarget**.

### 2. Repository variables (`novasafe-backend`)

Settings → Actions → Variables:

| Variable | Example |
|----------|---------|
| `AWS_ROLE_ARN` | `arn:aws:iam::793239449172:role/NovaSafeGitHubDeployRole` |
| `AWS_REGION` | `ap-south-1` |

### 3. Environment secrets (production)

**Repository:** `novasafe-backend` (not novasafe-deployment)

Settings → Environments → **production** → **Environment secrets** (not repository secrets):

| Secret | Value |
|--------|-------|
| `MOBILE_API_ENV_FILE` | Full contents of your VPS `/opt/novasafe-deployment/mobile-api/.env` |
| `ADMIN_API_ENV_FILE` | Full contents of your VPS `/opt/novasafe-deployment/platform/admin-api/.env` |

Copy-paste the **exact same file** you use on the VPS. No new variable names.

Lambda overrides (public URLs, logging) are merged automatically from `novasafe-deployment/infra-aws/config/env/*.lambda.overrides.example`.

### 4. MongoDB Atlas

Allow Lambda egress (Atlas → Network Access). Serverless functions use dynamic IPs — use `0.0.0.0/0` with strong DB credentials, or Atlas Private Endpoint.

---

## Deploy

| Service | Workflow |
|---------|----------|
| Mobile API | **Deploy AWS (mobile-api)** |
| Admin API | **Deploy AWS (admin-api)** |

Each run: build zip (with `.env`) → `aws lambda update-function-code`.

---

## Local packaging (optional)

```bash
# Merge VPS .env with Lambda overrides
node ../novasafe-deployment/.github/scripts/merge-env-files.mjs \
  /tmp/lambda.env \
  /path/to/mobile-api/.env \
  ../novasafe-deployment/infra-aws/config/env/mobile-api.lambda.overrides.example

# Package zip
node scripts/package-lambda.mjs --service core --env-file /tmp/lambda.env
```

---

## Switching Lambda ↔ VPS

| Direction | Action |
|-----------|--------|
| Lambda → VPS | Revert Cloudflare DNS to VPS; run existing Docker deploy — **no code changes** |
| VPS → Lambda | Point DNS to API Gateway; run Deploy AWS workflow — **no code changes** |

---

## Related

- `docs/runtime-architecture.md` — application vs runtime layers
- `novasafe-deployment/infra-aws/config/env/` — Lambda override templates
- `opt/novasafe-deployment/*/`.env.example` — VPS env templates (same keys)
