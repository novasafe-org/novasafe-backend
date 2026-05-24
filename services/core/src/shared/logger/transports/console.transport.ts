import winston from 'winston';
import type { LoggerConfig } from '../config';
import type { ILoggerTransport } from '../core/logger.interface';
import { createConsolePrettyFormat, createStructuredJsonFormat } from '../formatters';

/**
 * Console transport — pretty/color in development; plain JSON when colors are off (containers).
 */
export class ConsoleTransport implements ILoggerTransport {
  readonly name = 'console';

  constructor(private readonly config: LoggerConfig) {}

  build(): winston.transport {
    const useStructured =
      this.config.consoleStructured ||
      (!this.config.prettyPrint && this.config.jsonFormat);

    const format = useStructured
      ? createStructuredJsonFormat(this.config)
      : createConsolePrettyFormat(this.config);

    return new winston.transports.Console({
      format,
      level: this.config.level,
    });
  }
}
