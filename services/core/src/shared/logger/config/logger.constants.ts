import type { LogLevelName } from './logger.levels';

export const LOGGER_DEFAULTS = {
  SERVICE_NAME: 'novasafe-core',
  LOG_LEVEL: 'info' as LogLevelName,
  /** Local dev: relative `logs/` under cwd. Container/production: `/app/logs`. */
  LOG_DIR: 'logs',
  LOG_DIR_CONTAINER: '/app/logs',
  LOG_MAX_SIZE: '20m',
  LOG_MAX_FILES: '14d',
  LOG_DATE_PATTERN: 'YYYY-MM-DD',
  SENSITIVE_FIELDS: ['password', 'token', 'authorization', 'secret', 'apiKey', 'refreshToken'],
  REQUEST_ID_HEADER: 'x-request-id',
  CORRELATION_ID_HEADER: 'x-correlation-id',
} as const;

export const LOG_FILES = {
  /** Single file for all levels (production / container default). */
  APP: 'app-%DATE%.log',
  COMBINED: 'combined-%DATE%.log',
  ERROR: 'error-%DATE%.log',
} as const;
