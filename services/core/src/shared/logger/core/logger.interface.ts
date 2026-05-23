import type winston from 'winston';
import type { LogLevelName } from '../config';
import type { LogMeta } from './logger.types';

export interface ILogger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  verbose(message: string, meta?: LogMeta): void;
  success(message: string, meta?: LogMeta): void;
  request(message: string, meta?: LogMeta): void;
  audit(message: string, meta?: LogMeta): void;
  child(context: LogMeta): ILogger;
  getLevel(): LogLevelName;
}

export interface ILoggerTransport {
  readonly name: string;
  build(): winston.transport;
}

export interface ILogFormatter {
  format(entry: Record<string, unknown>): string;
}
