# NovaSafe Internal Logger

Plug-and-play, OOP-aligned logging framework for NovaSafe services.

## Quick start

```typescript
import './loadEnv';
import { LoggerManager, logger } from './shared/logger';

LoggerManager.getInstance().initialize();
LoggerManager.getInstance().printStartupBanner({ port: 5100 });

logger.info('Ready');
logger.child({ module: 'auth' }).debug('Module loaded');
```

## Copy to another service

1. Copy the entire `shared/logger` folder.
2. Set `LOG_SERVICE_NAME` in `.env`.
3. Call `LoggerManager.getInstance().initialize()` after `dotenv`.
4. Use `applyExpressLogging(app)` for HTTP request logs.

## Environment profiles

| Profile | Console (terminal) | File logs | Format |
|---------|-------------------|-----------|--------|
| **development** (`NODE_ENV=development`) | ON (colorful) | OFF (unless `LOG_ENABLE_FILE=true`) | Pretty |
| **production** / **Docker** | OFF | ON → single `app-YYYY-MM-DD.log` | JSON |
| **staging** | ON | ON (optional) | Readable |

In containers, logs are written under `LOG_DIR` (default `/app/logs`). Mount a volume there for persistence. Stdout stays quiet so the process does not flood Docker logs.

## Environment

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Minimum level |
| `LOG_ENABLE_CONSOLE` | Console transport (default: true in dev, false in production) |
| `LOG_ENABLE_FILE` | Rotating file logs (default: false in dev, true in production) |
| `LOG_FILE_MODE` | `single` (one app log) or `split` (combined + error files) |
| `LOG_DIR` | Directory for log files (`logs` locally, `/app/logs` in container) |
| `LOG_CONTAINER_MODE` | Force container/file-only behavior when `true` |
| `LOG_ENABLE_REQUEST` | HTTP request middleware |
| `LOG_ENABLE_ERROR_STACK` | Include stack traces |
| `LOG_ENABLE_COLORS` | ANSI colors (dev/staging) |
| `LOG_DIR` | File log directory |
| `LOG_MAX_SIZE` / `LOG_MAX_FILES` / `LOG_DATE_PATTERN` | Rotation |
| `LOG_PRETTY_PRINT` | Human-readable console |
| `LOG_JSON_FORMAT` | JSON file logs (console uses pretty format in dev) |
| `LOG_CONSOLE_STRUCTURED` | JSON stdout in containers (no ANSI) |
| `LOG_CONTEXT_FIELDS` | Comma-separated request-context fields on every log |
| `LOG_HTTP_FIELDS` | Comma-separated fields on HTTP access logs |
| `LOG_CONSOLE_META` | Print extra JSON block under console lines (default: false) |
| `LOG_CONSOLE_ERROR_STACK` | Stack traces on console (default: false; use file logs for stacks) |
| `LOG_REQUEST_BODY` / `LOG_RESPONSE_BODY` | Body logging |
| `LOG_SENSITIVE_FIELDS` | Redaction list (comma-separated) |
| `NODE_ENV` | development / staging / production presets |

## Metadata pipeline (where fields come from)

1. **Request context middleware** (`shared/request-context/`) parses headers → `RequestContext.toLogMeta()`.
2. **Logger bridge** (`request-context/bridge/logger-context.bridge.ts`) stores fields in AsyncLocalStorage.
3. **`LoggerContext.mergeMeta()`** (`logger/core/logger.context.ts`) merges store + platform context + call-site meta, then **filters** via `LOG_CONTEXT_FIELDS`.
4. **HTTP access logs** (`RequestLoggerService`) attach only fields listed in `LOG_HTTP_FIELDS`.
5. **Console** shows a single pretty line; **file/JSON** uses the same field allowlists.

Available context keys: see `config/log-context-fields.config.ts` (`LOG_CONTEXT_FIELD_KEYS`).

Example `.env`:

```env
LOG_CONTEXT_FIELDS=requestId,traceId,source,platform,userId
LOG_HTTP_FIELDS=requestId,method,url,statusCode,durationMs,ip
LOG_CONSOLE_META=false
```

## Architecture

- **config** — typed env configuration
- **core** — interfaces, context (AsyncLocalStorage), abstract logger
- **transports** — console, combined file, error file (Winston)
- **formatters** — console, JSON, request, error
- **managers** — `LoggerManager`, `TransportManager`
- **middleware** — request + error logging (Express adapters available)
- **services** — `LoggerService`, `RequestLoggerService`, `AuditLoggerService`

## Future monitoring

Extend `TransportManager.register()` with Loki, Elasticsearch, Datadog, or CloudWatch transports without changing call sites.
