# Mobile Vault production compose

Canonical `docker-compose.yml` for `/opt/novasafe/mobile-api/` on the server.

- **Service name:** `mobile_vault` (used by GitHub Actions deploy)
- **Container name:** `novasafe-mobile-vault` (used by nginx `upstream`)
- **Host debug port:** `127.0.0.1:8085` → container `3124`

Keep in sync with `novasafe-deployment/opt/novasafe/mobile-api/docker-compose.yml`.

Place production secrets in `/opt/novasafe/mobile-api/.env` on the server only (never committed).
