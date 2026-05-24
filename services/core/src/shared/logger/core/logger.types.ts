import type { LogLevelName } from '../config';

export type LogMetaValue = string | number | boolean | null | undefined | LogMeta | LogMetaValue[];

export interface LogMeta {
  [key: string]: LogMetaValue;
}

export interface LogEntry {
  level: LogLevelName;
  message: string;
  timestamp: string;
  service?: string;
  environment?: string;
  requestId?: string;
  correlationId?: string;
  context?: string;
  meta?: LogMeta;
  stack?: string;
  error?: {
    name: string;
    message: string;
    code?: string;
    category?: string;
  };
}

export interface RequestLogContext {
  requestId: string;
  correlationId?: string;
  method: string;
  url: string;
  path: string;
  ip?: string;
  userAgent?: string;
  statusCode?: number;
  durationMs?: number;
  contentLength?: number;
  body?: unknown;
  source?: string;
  platform?: string;
  legacySource?: string;
  userId?: string;
  context?: string;
  responseMessage?: string;
  responseCode?: string;
}

export interface AuditLogEntry extends LogEntry {
  action: string;
  actorId?: string;
  resource?: string;
  outcome?: 'success' | 'failure';
}

export type TransportType = 'console' | 'file' | 'error' | 'combined';
