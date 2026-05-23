import winston from 'winston';
import { LOG_FILES, LOG_LEVEL_COLORS, LOG_LEVELS, type LoggerConfig } from '../config';
import type { ILoggerTransport } from '../core/logger.interface';
import {
  CombinedTransport,
  ConsoleTransport,
  ErrorTransport,
  FileTransport,
} from '../transports';

/**
 * Registers and builds Winston transports from configuration.
 * Extend with Loki / Elasticsearch / Datadog adapters later.
 */
export class TransportManager {
  private readonly transports: ILoggerTransport[] = [];

  constructor(private readonly config: LoggerConfig) {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    if (this.config.enableConsole) {
      this.transports.push(new ConsoleTransport(this.config));
    }

    if (this.config.enableFile) {
      if (this.config.fileOutputMode === 'single') {
        this.transports.push(
          new FileTransport(this.config, LOG_FILES.APP, this.config.level),
        );
      } else {
        this.transports.push(new CombinedTransport(this.config));
        this.transports.push(new ErrorTransport(this.config));
      }
    }
  }

  register(transport: ILoggerTransport): void {
    this.transports.push(transport);
  }

  buildWinstonLogger(): winston.Logger {
    winston.addColors(LOG_LEVEL_COLORS);
    const built = this.transports.map((transport) => transport.build());

    if (built.length === 0) {
      throw new Error(
        'No logging transports enabled. Set LOG_ENABLE_CONSOLE=true and/or LOG_ENABLE_FILE=true.',
      );
    }

    return winston.createLogger({
      levels: LOG_LEVELS,
      level: this.config.level,
      defaultMeta: {
        service: this.config.serviceName,
        environment: this.config.environment,
      },
      transports: built,
      exitOnError: false,
    });
  }

  getRegisteredTransportNames(): string[] {
    return this.transports.map((t) => t.name);
  }
}
