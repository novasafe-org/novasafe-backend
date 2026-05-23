import type { LoggerConfig } from '../config';
import { formatRequestLine } from '../formatters';
import type { RequestLogContext } from '../core/logger.types';
import type { LoggerService } from './logger.service';

export class RequestLoggerService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: LoggerConfig,
  ) {}

  logCompleted(context: RequestLogContext): void {
    if (!this.config.enableRequest) return;

    const line = formatRequestLine(context, this.config);
    this.logger.request(line, {
      requestId: context.requestId,
      correlationId: context.correlationId,
      method: context.method,
      url: context.url,
      path: context.path,
      statusCode: context.statusCode,
      durationMs: context.durationMs,
      ip: context.ip,
      userAgent: context.userAgent,
      contentLength: context.contentLength,
    });
  }
}
