import type winston from 'winston';
import type { LogLevelName } from '../config';
import { LoggerContext } from './logger.context';
import type { ILogger } from './logger.interface';
import type { LogMeta } from './logger.types';

type LogArg = string | LogMeta;

export abstract class AbstractLogger implements ILogger {
  constructor(
    protected readonly winston: winston.Logger,
    protected readonly baseMeta: LogMeta = {},
    protected readonly contextLabel?: string,
  ) {}

  protected normalizeArgs(
    first: LogArg,
    second?: LogArg,
  ): { message: string; meta: LogMeta } {
    if (typeof first === 'string') {
      return {
        message: first,
        meta: typeof second === 'object' ? second || {} : {},
      };
    }
    return {
      message: typeof second === 'string' ? second : '',
      meta: first || {},
    };
  }

  protected write(level: LogLevelName, first: LogArg, second?: LogArg): void {
    const { message, meta } = this.normalizeArgs(first, second);
    const payload = LoggerContext.mergeMeta({
      service: this.baseMeta.service,
      environment: this.baseMeta.environment,
      context: this.contextLabel,
      ...this.baseMeta,
      ...meta,
    });

    this.winston.log({ level, message, ...payload });
  }

  info(first: LogArg, second?: LogArg): void {
    this.write('info', first, second);
  }

  warn(first: LogArg, second?: LogArg): void {
    this.write('warn', first, second);
  }

  error(first: LogArg, second?: LogArg): void {
    this.write('error', first, second);
  }

  debug(first: LogArg, second?: LogArg): void {
    this.write('debug', first, second);
  }

  verbose(first: LogArg, second?: LogArg): void {
    this.write('verbose', first, second);
  }

  success(first: LogArg, second?: LogArg): void {
    this.write('success', first, second);
  }

  request(first: LogArg, second?: LogArg): void {
    this.write('http', first, second);
  }

  audit(first: LogArg, second?: LogArg): void {
    this.write('audit', first, second);
  }

  child(context: LogMeta): ILogger {
    return this.createChild(context);
  }

  abstract getLevel(): LogLevelName;

  protected abstract createChild(context: LogMeta): ILogger;
}
