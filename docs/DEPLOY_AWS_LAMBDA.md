# Deploy NovaSafe backends to AWS Lambda

Lambda reads production config from a **private S3 bucket** — upload two `.env` files once, CI downloads them at deploy time. No VPS and no one-by-one GitHub secrets.

---

## One-time setup

### 1. Deploy CDK stacks

In `novasafe-deployment` → **Deploy Infrastructure**:

| Stack | Creates |
|-------|---------|
| **MobileApi** | Lambda `novasafe-prod-fn-mobile-api`, API GW, ACM |
| **AdminApi** | Lambda `novasafe-prod-fn-admin-api`, S3 uploads, API GW, ACM |

Add ACM DNS validation in Cloudflare, then CNAME each subdomain to **CustomDomainTarget** from stack outputs.

### 2. Create config S3 bucket

Private bucket in `ap-south-1`, block public access:

```bash
BUCKET=novasafe-prod-backend-config-<account-id>

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

### 3. Upload `.env` files to S3

Start from templates in `novasafe-deployment`:

- `opt/novasafe-deployment/mobile-api/.env.example`
- `opt/novasafe-deployment/platform/admin-api/.env.example`

Upload:

```bash
aws s3 cp mobile-api.env s3://$BUCKET/mobile-api/.env --sse AES256
aws s3 cp admin-api.env  s3://$BUCKET/admin-api/.env  --sse AES256
```

### 4. Repository variables (`novasafe-backend`)

Settings → Actions → **Variables**:

| Variable | Example |
|----------|---------|
| `AWS_ROLE_ARN` | `arn:aws:iam::793239449172:role/NovaSafeGitHubDeployRole` |
| `AWS_REGION` | `ap-south-1` |
| `BACKEND_CONFIG_BUCKET` | `novasafe-prod-backend-config-793239449172` |

### 5. IAM

Grant the GitHub OIDC deploy role `s3:GetObject` on `arn:aws:s3:::BUCKET/*`.

### 6. MongoDB Atlas

Allow Lambda egress in Atlas Network Access.

---

## Deploy

| Service | Workflow | Trigger |
|---------|----------|---------|
| Mobile API | **Deploy AWS (mobile-api)** | Push to `master` (core paths) or manual |
| Admin API | **Deploy AWS (admin-api)** | Manual |

> **Note:** The main **NovaSafe Backend Deploy** CI pipeline builds Docker images for the VPS. It does **not** update AWS Lambda. Lambda deploys only run via the workflows above.

Each run: download `.env` from S3 → merge overrides → esbuild bundle → deploy slim zip (no `node_modules`) → smoke test.

To update config, re-upload to S3 and re-run the workflow.

---

## Related

- `docs/runtime-architecture.md`
- `novasafe-deployment/infra-aws/config/env/` — Lambda override templates
