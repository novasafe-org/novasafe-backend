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
| `LOG_JSON_FORMAT` | JSON console/file |
| `LOG_REQUEST_BODY` / `LOG_RESPONSE_BODY` | Body logging |
| `LOG_SENSITIVE_FIELDS` | Redaction list (comma-separated) |
| `NODE_ENV` | development / staging / production presets |

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
