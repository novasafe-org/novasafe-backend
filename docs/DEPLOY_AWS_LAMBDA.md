# Deploy NovaSafe backends to AWS Lambda

Parallel path to VPS Docker. **VPS deployment is unchanged** — same `node dist/index.js`, same `.env` on the server.

Lambda uses the **same `.env` file on your VPS** — CI fetches it over SSH during deploy. You do **not** need to copy dozens of variables into GitHub one by one.

---

## One-time setup

### 1. Deploy CDK stacks

In `novasafe-deployment` → **Deploy Infrastructure**:

| Stack | Creates |
|-------|---------|
| **MobileApi** | Lambda `novasafe-prod-fn-mobile-api`, API GW, ACM |
| **AdminApi** | Lambda `novasafe-prod-fn-admin-api`, S3 uploads, API GW, ACM |

Add ACM DNS validation in Cloudflare, then CNAME each subdomain to **CustomDomainTarget** from stack outputs.

### 2. Repository variables (`novasafe-backend`)

Settings → Actions → **Variables**:

| Variable | Example |
|----------|---------|
| `AWS_ROLE_ARN` | `arn:aws:iam::793239449172:role/NovaSafeGitHubDeployRole` |
| `AWS_REGION` | `ap-south-1` |

### 3. Repository secrets (`novasafe-backend`)

**Same SSH secrets you already use for VPS Docker deploy** — no new env secrets:

| Secret | Purpose |
|--------|---------|
| `SSH_USER` | VPS SSH user |
| `SSH_HOST` | VPS IP or hostname |
| `SSH_PASSWORD` | VPS SSH password (or use `SSH_PRIVATE_KEY`) |
| `DEPLOY_PATH` | e.g. `/opt/novasafe-deployment` |
| `SSH_PRIVATE_KEY` | Optional — SSH key instead of password |

### 4. VPS `.env` files (source of truth)

Lambda deploy reads these files from the server:

| Service | VPS path |
|---------|----------|
| Mobile API | `${DEPLOY_PATH}/mobile-api/.env` |
| Admin API | `${DEPLOY_PATH}/platform/admin-api/.env` |

Keep managing env **only on the VPS** (same as today). Lambda overrides (public URLs, logging) are merged automatically at package time.

### 5. MongoDB Atlas

Allow Lambda egress in Atlas Network Access.

---

## Deploy

| Service | Workflow |
|---------|----------|
| Mobile API | **Deploy AWS (mobile-api)** |
| Admin API | **Deploy AWS (admin-api)** |

Each run: SSH fetch `.env` from VPS → merge overrides → build zip → deploy to Lambda.

---

## Switching Lambda ↔ VPS

| Direction | Action |
|-----------|--------|
| Lambda → VPS | Revert Cloudflare DNS; run existing Docker deploy |
| VPS → Lambda | Point DNS to API Gateway; run Deploy AWS workflow |

No application code changes required.

---

## Related

- `docs/runtime-architecture.md`
- `novasafe-deployment/infra-aws/config/env/` — Lambda override templates
- `novasafe-deployment/opt/novasafe-deployment/` — VPS `.env` locations
