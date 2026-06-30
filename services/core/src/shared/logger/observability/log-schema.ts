/** Vendor-neutral structured log schema (see docs/OBSERVABILITY.md). */

export const LOG_SCHEMA_VERSION = 1 as const;

export const LOG_TYPES = {
  ACCESS: 'access',
  APP: 'app',
  AUDIT: 'audit',
} as const;

export type LogType = (typeof LOG_TYPES)[keyof typeof LOG_TYPES];

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx' | '1xx' | 'unknown';

export const resolveStatusClass = (statusCode?: number): StatusClass => {
  const status = statusCode ?? 0;
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  if (status >= 200) return '2xx';
  if (status >= 100) return '1xx';
  return 'unknown';
};

/** HTTP access severity — Grafana/Datadog-friendly (no custom `http` level). */
export const resolveAccessLogLevel = (statusCode?: number): 'error' | 'warn' | 'info' => {
  const status = statusCode ?? 0;
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
};

export interface AccessLogEnrichment {
  logType: typeof LOG_TYPES.ACCESS;
  statusClass: StatusClass;
}

export const buildAccessLogEnrichment = (statusCode?: number): AccessLogEnrichment => ({
  logType: LOG_TYPES.ACCESS,
  statusClass: resolveStatusClass(statusCode),
});
