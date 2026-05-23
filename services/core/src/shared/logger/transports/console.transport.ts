import winston from 'winston';
import type { LoggerConfig } from '../config';
import type { ILoggerTransport } from '../core/logger.interface';
import { createConsoleFormat, createJsonFormat } from '../formatters';

export class ConsoleTransport implements ILoggerTransport {
  readonly name = 'console';

  constructor(private readonly config: LoggerConfig) {}

  build(): winston.transport {
    const format =
      this.config.jsonFormat && !this.config.prettyPrint
        ? createJsonFormat(this.config)
        : winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: this.config.enableErrorStack }),
            winston.format((info) => {
              info.service = this.config.serviceName;
              const { requestId, correlationId, context, ...rest } = info;
              if (Object.keys(rest).length > 4) {
                info.meta = rest;
              }
              return info;
            })(),
            createConsoleFormat(this.config),
          );

    return new winston.transports.Console({
      format,
      level: this.config.level,
    });
  }
}
