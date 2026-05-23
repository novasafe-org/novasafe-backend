import type winston from 'winston';
import type { LogLevelName, LoggerConfig } from '../config';
import { AbstractLogger } from '../core/abstract.logger';
import type { ILogger } from '../core/logger.interface';
import type { LogMeta } from '../core/logger.types';

export class LoggerService extends AbstractLogger implements ILogger {
  constructor(
    winstonLogger: winston.Logger,
    private readonly config: LoggerConfig,
    baseMeta: LogMeta = {},
    contextLabel?: string,
  ) {
    super(winstonLogger, {
      service: config.serviceName,
      environment: config.environment,
      ...baseMeta,
    }, contextLabel);
  }

  getLevel(): LogLevelName {
    return this.winston.level as LogLevelName;
  }

  protected createChild(context: LogMeta): ILogger {
    return new LoggerService(
      this.winston.child(context),
      this.config,
      { ...this.baseMeta, ...context },
      this.contextLabel,
    );
  }
}
