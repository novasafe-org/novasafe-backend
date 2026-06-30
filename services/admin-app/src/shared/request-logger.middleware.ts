import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { shouldLogHealthProbeAccess } from './health-probe.util';
import { logger } from './logger';

const LOG_SCHEMA_VERSION = 1;
const LOG_TYPE_ACCESS = 'access';
const LOG_TYPE_APP = 'app';

type StatusClass = '2xx' | '3xx' | '4xx' | '5xx' | '1xx' | 'unknown';

const resolveStatusClass = (statusCode: number): StatusClass => {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  if (statusCode >= 100) return '1xx';
  return 'unknown';
};

const resolveAccessLevel = (statusCode: number): 'error' | 'warn' | 'info' => {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
};

const buildAccessMessage = (method: string, url: string, statusCode: number, durationMs: number): string =>
  [method, url, String(statusCode), `${durationMs}ms`].join(' ');

const writeAccessLog = (
  level: 'error' | 'warn' | 'info',
  payload: Record<string, unknown>,
): void => {
  const message = String(payload.message ?? '');
  const { message: _omit, ...meta } = payload;

  if (level === 'error') {
    logger.error(message, meta);
    return;
  }
  if (level === 'warn') {
    logger.warn(message, meta);
    return;
  }
  logger.info(message, meta);
};

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();
  const requestId = (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID();

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Math.round((Number(process.hrtime.bigint() - startedAt) / 1_000_000) * 100) / 100;
    const statusCode = res.statusCode;
    const method = req.method;
    const path = req.path;
    const url = req.originalUrl || req.url;
    if (!shouldLogHealthProbeAccess(path, statusCode)) {
      return;
    }

    const level = resolveAccessLevel(statusCode);

    const record: Record<string, unknown> = {
      schemaVersion: LOG_SCHEMA_VERSION,
      logType: LOG_TYPE_ACCESS,
      statusClass: resolveStatusClass(statusCode),
      requestId,
      method,
      path,
      url,
      statusCode,
      durationMs,
      message: buildAccessMessage(method, url, statusCode, durationMs),
    };

    writeAccessLog(level, record);
  });

  next();
};

export const LOG_TYPES = {
  ACCESS: LOG_TYPE_ACCESS,
  APP: LOG_TYPE_APP,
} as const;
