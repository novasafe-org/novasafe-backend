# NovaSafe Core Service

Unified backend platform (architecture scaffold). This service is **not** connected to a database yet and does not implement business APIs.

## Structure

- `src/modules/` — Domain modules (`auth`, `users`, `vault`, …)
- `src/shared/` — Cross-cutting utilities
- `src/config/`, `src/database/`, `src/queues/`, `src/events/` — Platform layers

## Scripts

From repository root:

```bash
pnpm run start:core    # development (tsx watch)
pnpm run build:core    # compile TypeScript
```

From this directory:

```bash
pnpm run dev
pnpm run build
pnpm run start
```

## Health

- `GET /health`
- `GET /api/v1/health`
- `GET /api/v1/{auth|users|vault}/health` — module placeholders

## Environment

Copy `.env.example` to `.env`. Default port: `3125` (`CORE_PORT`).

## Logging (`src/shared/logger/`)

Internal plug-and-play logging framework (Winston + picocolors). See [src/shared/logger/README.md](src/shared/logger/README.md).

```bash
pnpm run start:core
```

- **Development**: colorful logs in the terminal (`LOG_ENABLE_CONSOLE=true`, file off by default)
- **Production / Docker**: file-only JSON logs in `/app/logs/app-YYYY-MM-DD.log` (no console spam)
- Mount `/app/logs` as a volume in Docker for log persistence
- Request IDs via `x-request-id` / `x-correlation-id`

### MongoDB (Mongoose)

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | Full connection string (overrides parts below) |
| `MONGO_DB_NAME` | Database name (default: `novasafe_core`) |
| `MONGO_USER` / `MONGO_PASSWORD` / `MONGO_HOST` | Used to build URI when `MONGO_URI` is empty |
| `MONGO_POOL_SIZE` | Connection pool size |
| `MONGO_TIMEOUT` | Server selection / socket timeout (ms) |
| `MONGO_RETRY_ATTEMPTS` | Connect retry count |
| `MONGO_RETRY_DELAY` | Delay between retries (ms) |

Startup connects via `ConnectionManager` before the HTTP server listens. Health endpoints report DB state and ping.

## Database layer (`src/database/`)

- `config/` — typed env config + validation
- `connection/` — `DatabaseConnection`, `MongooseConnection` (singleton, retries, events)
- `core/` — `BaseEntity`, `AbstractRepository`, `BaseRepository`, interfaces
- `schemas/` + `plugins/` — reusable base schema, timestamps / soft-delete plugins
- `managers/` — `ConnectionManager`, `TransactionManager`
- `repositories/` — `RepositoryFactory` registry (for future module repos)
- `utils/` — pagination, transaction helpers

## Rules (current phase)

- Do not migrate code from `mobile_vault` or legacy `vault` yet.
- No business Mongoose models or module repositories yet.
- No Prisma.
- Add features inside `src/modules/<name>/` following the layered folders.
