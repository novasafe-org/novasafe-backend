import winston from 'winston';
import type { LoggerConfig } from '../config';
import { pickLogFields } from '../config/log-context-fields.config';
import { stripAnsi } from '../utils/ansi.util';

const RESERVED = new Set(['level', 'message', 'timestamp', 'service', 'environment', 'stack', 'label', 'meta']);

/**
 * Production / file / JSON-console pipeline — flat JSON, no ANSI, machine-parseable.
 * Field set follows LOG_CONTEXT_FIELDS + per-log extras (e.g. HTTP).
 */
export const createStructuredJsonFormat = (config: LoggerConfig) =>
  winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: config.enableErrorStack }),
    winston.format.printf((info) => {
      const record: Record<string, unknown> = {
        service: info.service,
        environment: info.environment,
        level: info.level,
        message: stripAnsi(String(info.message ?? '')),
        timestamp: info.timestamp,
      };

      if (info.stack && config.enableErrorStack) {
        record.stack = info.stack;
      }

      const extras: Record<string, unknown> = {};
      if (info.meta && typeof info.meta === 'object' && !Array.isArray(info.meta)) {
        Object.assign(extras, info.meta as Record<string, unknown>);
      }

      for (const [key, value] of Object.entries(info)) {
        if (RESERVED.has(key) || value === undefined) continue;
        extras[key] = value;
      }

      const contextKeys = [
        ...config.contextFields,
        ...config.httpFields,
        'err',
        'code',
        'category',
        'error',
      ];
      const picked = pickLogFields(extras, [...new Set(contextKeys)]);
      Object.assign(record, picked);

      return JSON.stringify(record);
    }),
  );

/** @deprecated Use createStructuredJsonFormat */
export const createJsonFormat = createStructuredJsonFormat;
