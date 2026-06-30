# NovaSafe observability — vendor-neutral log schema

Structured logging contract for **Grafana Cloud (Loki) today** and **Datadog / other backends tomorrow**.  
Applications emit one canonical JSON shape; the collector (Alloy today) maps fields to backend-specific labels/tags.

## Design principles

1. **Apps own the schema** — backends never parse plain-text log lines.
2. **Low-cardinality → collector labels** — `service`, `level`, `logType`, `environment`.
3. **High-cardinality → JSON fields** — `path`, `userId`, `requestId`, `traceId`.
4. **Stable field names** — same keys work in Loki, Datadog, Elasticsearch, OTLP.
5. **Versioned** — `schemaVersion` enables non-breaking evolution.

## Canonical log record (schema v1)

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-06-30T10:36:43.527Z",
  "service": "mobile-api",
  "environment": "production",
  "level": "info",
  "logType": "access",
  "message": "GET /mobile/health 200 5.56ms",
  "method": "GET",
  "path": "/mobile/health",
  "url": "/mobile/health",
  "statusCode": 200,
  "statusClass": "2xx",
  "durationMs": 5.56,
  "requestId": "req_abc123",
  "correlationId": "corr_xyz",
  "traceId": "trace_456",
  "userId": "user_789"
}
```

### Required fields (every line)

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Currently `1` |
| `timestamp` | string | ISO-8601 (RFC3339) |
| `service` | string | `mobile-api`, `admin-api`, … |
| `environment` | string | `production`, `staging`, … |
| `level` | string | `error`, `warn`, `info`, `debug` (Grafana/Datadog severity) |
| `logType` | string | `access`, `app`, `audit` |
| `message` | string | Human-readable one-liner |

### Access log fields (`logType: "access"`)

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | HTTP verb |
| `path` | string | Route path |
| `url` | string | Full URL / originalUrl |
| `statusCode` | number | HTTP status |
| `statusClass` | string | `2xx`, `3xx`, `4xx`, `5xx` |
| `durationMs` | number | Round-trip ms |

### Correlation fields (when available)

| Field | Type |
|-------|------|
| `requestId` | string |
| `correlationId` | string |
| `traceId` | string |
| `userId` | string |

### Level rules (HTTP access)

| Status | `level` | `logType` |
|--------|---------|-----------|
| 2xx / 3xx | `info` | `access` |
| 4xx | `warn` | `access` |
| 5xx | `error` | `access` |

Non-HTTP logs use `logType: "app"` (default) or `logType: "audit"`.

## Collector label mapping (Alloy → Loki)

| JSON field | Loki label | Cardinality |
|------------|------------|-------------|
| — | `job` | fixed `novasafe` |
| `service` | `service` | low |
| `environment` | `environment` | low |
| `level` | `level` | low |
| `logType` | `log_type` | low |
| `method` | — | JSON only (optional label later) |
| `statusClass` | — | JSON only |
| `path`, `userId`, … | — | **never** label |

**Rule:** never promote `path`, `userId`, or `requestId` to labels (cost + cardinality).

## Vendor migration map

| NovaSafe field | Datadog attribute | ECS / OTel |
|----------------|-------------------|------------|
| `service` | `service` | `service.name` |
| `environment` | `env` | `deployment.environment` |
| `level` | `status` | `log.level` |
| `logType` | `log_type` | `log.type` (custom) |
| `message` | `message` | `body` |
| `method` | `http.method` | `http.request.method` |
| `path` | `http.url_details.path` | `url.path` |
| `statusCode` | `http.status_code` | `http.response.status_code` |
| `durationMs` | `duration` | — |
| `requestId` | `http.request_id` | — |
| `traceId` | `dd.trace_id` / `trace_id` | `trace.id` |
| `userId` | `usr.id` | `user.id` |

### Migrating Grafana → Datadog

1. **Keep app JSON unchanged** — point Datadog Agent / OpenTelemetry Collector at the same log files or stdout.
2. **Map tags** in `datadog.yaml` `logs_config.processing_rules` or OTel `attributes` processor.
3. **Re-create dashboards** using Datadog Log Analytics (same field names).
4. **Alerts** — translate LogQL to Datadog log queries (`service:mobile-api @logType:access @statusClass:5xx`).

### Migrating to OpenTelemetry (future)

Emit the same fields as OTLP log record attributes; `schemaVersion` becomes resource attribute `novasafe.log.schema_version`.

## Implementation locations

| Component | Path |
|-----------|------|
| Schema helpers | `services/core/src/shared/logger/observability/` |
| mobile-api logger | `services/core/src/shared/logger/` |
| admin-api logger | `services/admin-app/src/shared/logger.ts` |
| Alloy pipeline | `novasafe-deployment/.../infra/observability/alloy/main.alloy` |
| Grafana dashboard | `.../grafana/dashboards/novasafe-api-logs.json` |
| Runbook | `novasafe-deployment/docs/LOGGING_GRAFANA.md` |

## Rollout checklist

- [ ] Deploy backend images (mobile-api + admin-api) with schema v1
- [ ] `./deploy.sh observability` on VPS (Alloy config)
- [ ] Re-import Grafana dashboard (UID `novasafe-api-logs`, replace existing)
- [ ] Verify Explore: `{job="novasafe"} | json | logType="access"`
- [ ] Confirm KPI panels populate (errors, latency, table columns)
