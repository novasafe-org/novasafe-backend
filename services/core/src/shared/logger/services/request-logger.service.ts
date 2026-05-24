import type { LoggerConfig } from '../config';
import { pickLogFields } from '../config/log-context-fields.config';
import { buildPlainRequestMessage } from '../formatters';
import type { RequestLogContext } from '../core/logger.types';
import type { LoggerService } from './logger.service';

export class RequestLoggerService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: LoggerConfig,
  ) {}

  logCompleted(context: RequestLogContext): void {
    if (!this.config.enableRequest) return;

    const message = buildPlainRequestMessage(context);
    const httpMeta = pickLogFields(
      {
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
        declaredSource: context.source,
        source: context.source,
        platform: context.platform,
      },
      this.config.httpFields,
    );

    this.logger.request(message, httpMeta);
  }
}
