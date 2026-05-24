import type winston from 'winston';
import { loadLoggerConfig, type LoggerConfig } from '../config';
import { printServerStartupBanner } from '../utils/startup-banner.util';
import { AuditLoggerService, LoggerService, RequestLoggerService } from '../services';
import { TransportManager } from './transport.manager';

/**
 * Central logging coordinator — singleton entry point for the core service.
 */
export class LoggerManager {
  private static instance: LoggerManager | null = null;

  private config: LoggerConfig = loadLoggerConfig();

  private winstonLogger: winston.Logger | null = null;

  private loggerService: LoggerService | null = null;

  private requestLogger: RequestLoggerService | null = null;

  private auditLogger: AuditLoggerService | null = null;

  private transportManager: TransportManager | null = null;

  private constructor() {}

  static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  initialize(config: LoggerConfig = loadLoggerConfig()): LoggerService {
    this.config = config;
    this.transportManager = new TransportManager(config);
    this.winstonLogger = this.transportManager.buildWinstonLogger();
    this.loggerService = new LoggerService(this.winstonLogger, config);
    this.requestLogger = new RequestLoggerService(this.loggerService, config);
    this.auditLogger = new AuditLoggerService(this.loggerService);
    return this.loggerService;
  }

  getLogger(): LoggerService {
    if (!this.loggerService) {
      return this.initialize();
    }
    return this.loggerService;
  }

  getRequestLogger(): RequestLoggerService {
    return this.requestLogger ?? new RequestLoggerService(this.getLogger(), this.config);
  }

  getAuditLogger(): AuditLoggerService {
    return this.auditLogger ?? new AuditLoggerService(this.getLogger());
  }

  getConfig(): LoggerConfig {
    return this.config;
  }

  getWinston(): winston.Logger {
    return this.winstonLogger ?? this.transportManager!.buildWinstonLogger();
  }

  printStartupBanner(meta: Record<string, unknown> = {}): void {
    const port = typeof meta.port === 'number' ? meta.port : Number(process.env.CORE_PORT || process.env.PORT || 3125);
    const bind = typeof meta.bind === 'string' ? meta.bind : process.env.BIND_HOST || '0.0.0.0';
    const database =
      meta.database && typeof meta.database === 'object'
        ? (meta.database as { state?: string; ready?: boolean; dbName?: string; host?: string })
        : undefined;

    printServerStartupBanner({
      port,
      bind,
      serviceName: this.config.serviceName,
      environment: this.config.environment,
      enableColors: this.config.enableColors,
      database,
      logLevel: this.config.level,
    });

    this.getLogger().debug('Logging transports ready', {
      transports: this.transportManager?.getRegisteredTransportNames(),
      console: this.config.enableConsole,
      file: this.config.enableFile,
      fileOutputMode: this.config.fileOutputMode,
      logDir: this.config.logDir,
      json: this.config.jsonFormat,
    });
  }

  async shutdown(): Promise<void> {
    const logger = this.loggerService;
    if (logger) {
      logger.info('Logger shutting down');
    }
    await new Promise<void>((resolve) => {
      this.winstonLogger?.end(() => resolve());
      if (!this.winstonLogger) resolve();
    });
    this.winstonLogger = null;
    this.loggerService = null;
    this.requestLogger = null;
    this.auditLogger = null;
    this.transportManager = null;
  }
}
