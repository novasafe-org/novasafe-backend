# VPS production `.env` audit checklist (SEC-01.4).
# Run after each deploy or quarterly. Do not commit real values.

## On the VPS

1. SSH in and locate deploy env files (e.g. `DEPLOY_PATH/.env`, `docker-compose` overrides).
2. Confirm permissions: `chmod 600` on all `.env` files; owner = deploy user only.
3. Verify secrets are not world-readable: `find . -name '.env*' -perm /o+r`.
4. Confirm no secrets in shell history or process list (`ps eww` spot-check).
5. Rotate any credential that was ever pasted into chat, tickets, or logs.

## In git / CI

- `./scripts/run-gitleaks.sh` — no leaks in repo history
- Dependabot + Trivy workflows on `main` PRs
- Never commit `.env`, `*.pem`, API keys, or Resend/SMTP passwords

## Required production env (reference only)

```env
JWT_SECRET=...
MONGODB_URI=...
RESEND_API_KEY=...
CORS_ALLOWED_ORIGINS=https://novasafe.io,https://app.novasafe.io,...
```

Record audit date and operator in your internal runbook when complete.
