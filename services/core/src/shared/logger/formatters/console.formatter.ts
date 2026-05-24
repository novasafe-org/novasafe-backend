import winston from 'winston';
import type { LoggerConfig } from '../config';
import type { LogLevelName } from '../config';
import type { RequestLogContext } from '../core/logger.types';
import { colorize, colorizeLevel } from '../utils/color.util';
import { formatColoredRequestSummary } from './request.formatter';
import { formatLocalTimestamp } from '../utils/timestamp.util';

const stringifyMeta = (meta: unknown): string => {
  if (!meta || typeof meta !== 'object') return '';
  const entries = Object.entries(meta as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  try {
    return JSON.stringify(Object.fromEntries(entries), null, 2);
  } catch {
    return String(meta);
  }
};

const isHttpRequestMeta = (
  info: winston.Logform.TransformableInfo,
): info is winston.Logform.TransformableInfo & {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
} =>
  typeof info.method === 'string' &&
  typeof info.url === 'string' &&
  typeof info.statusCode === 'number' &&
  typeof info.requestId === 'string';

export const formatConsoleLine = (
  info: winston.Logform.TransformableInfo,
  config: LoggerConfig,
): string => {
  const level = String(info.level) as LogLevelName;
  const timestamp = formatLocalTimestamp(
    info.timestamp ? new Date(String(info.timestamp)) : new Date(),
  );

  const service = info.service ? colorize('gray', `[${info.service}]`, config.enableColors) : '';
  const sourceTag =
    info.sourceLabel || info.context
      ? colorize('cyan', String(info.sourceLabel || info.context), config.enableColors)
      : '';
  const requestId = info.requestId
    ? colorize('magenta', `[${info.requestId}]`, config.enableColors)
    : '';
  const levelLabel = colorizeLevel(level, level.toUpperCase().padEnd(7), config.enableColors);

  let message: string;
  if (isHttpRequestMeta(info)) {
    message = formatColoredRequestSummary(
      {
        requestId: info.requestId,
        method: info.method,
        url: info.url,
        path: typeof info.path === 'string' ? info.path : info.url,
        statusCode: Number(info.statusCode) || 0,
        durationMs: Number(info.durationMs) || 0,
        ip: typeof info.ip === 'string' ? info.ip : undefined,
      } satisfies RequestLogContext,
      config,
    );
  } else {
    message = colorize('white', String(info.message), config.enableColors);
  }

  const metaBlock =
    config.consoleMeta && info.meta && stringifyMeta(info.meta)
      ? `\n${colorize('gray', stringifyMeta(info.meta), config.enableColors)}`
      : '';

  const sourcePrefix = sourceTag ? `${sourceTag} ` : '';
  const requestPrefix = requestId ? `${requestId} ` : '';
  return `${colorize('gray', timestamp, config.enableColors)} ${levelLabel} ${service} ${sourcePrefix}${requestPrefix}${message}${metaBlock}`;
};

export const createConsolePrettyFormat = (config: LoggerConfig) =>
  winston.format.combine(
    winston.format.timestamp(),
    winston.format((info) => {
      const reserved = new Set([
        'level',
        'message',
        'timestamp',
        'service',
        'environment',
        'requestId',
        'correlationId',
        'context',
        'source',
        'sourceLabel',
        'declaredSource',
        'verifiedSource',
        'platform',
        'legacySource',
        'traceId',
        'method',
        'url',
        'path',
        'statusCode',
        'durationMs',
        'ip',
        'userAgent',
        'contentLength',
        'meta',
        'stack',
        'label',
        'err',
        'code',
        'category',
      ]);
      const meta: Record<string, unknown> =
        typeof info.meta === 'object' && info.meta && !Array.isArray(info.meta)
          ? { ...(info.meta as Record<string, unknown>) }
          : {};

      for (const key of Object.keys(info)) {
        if (reserved.has(key)) continue;
        meta[key] = info[key];
        delete info[key];
      }

      if (Object.keys(meta).length > 0) {
        info.meta = meta;
      } else {
        delete info.meta;
      }
      return info;
    })(),
    winston.format.printf((info) => {
      const line = formatConsoleLine(info, config);
      info[Symbol.for('message')] = line;
      return line;
    }),
  );

/** @deprecated Use createConsolePrettyFormat */
export const createConsoleFormat = createConsolePrettyFormat;
