import type winston from 'winston';
import { loadLoggerConfig, type LoggerConfig } from '../config';
import { colorize, pc } from '../utils/color.util';
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
    const logger = this.getLogger();
    const line = colorize('cyan', '═'.repeat(56), this.config.enableColors);
    logger.success(line);
    logger.success(
      colorize('bold', `  ${this.config.serviceName.toUpperCase()} — ${this.config.environment}`, this.config.enableColors),
    );
    logger.info('Logging initialized', {
      level: this.config.level,
      transports: this.transportManager?.getRegisteredTransportNames(),
      console: this.config.enableConsole,
      file: this.config.enableFile,
      fileOutputMode: this.config.fileOutputMode,
      logDir: this.config.logDir,
      json: this.config.jsonFormat,
      ...meta,
    });
    logger.success(line);
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
