import type { LoggerConfig } from '../config';
import { pickLogFields } from '../config/log-context-fields.config';
import type { RequestLogContext } from '../core/logger.types';
import { buildPlainRequestMessage } from '../formatters';
import {
  buildAccessLogEnrichment,
  resolveAccessLogLevel,
  shouldLogHealthProbeAccess,
} from '../observability';
import type { LoggerService } from './logger.service';

export class RequestLoggerService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: LoggerConfig,
  ) {}

  logCompleted(context: RequestLogContext): void {
    if (!this.config.enableRequest) return;

    if (!shouldLogHealthProbeAccess(context.path, context.statusCode)) {
      return;
    }

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
        userId: context.userId,
        context: context.context,
        responseMessage: context.responseMessage,
        responseCode: context.responseCode,
      },
      this.config.httpFields,
    );

    const accessMeta = {
      ...httpMeta,
      ...buildAccessLogEnrichment(context.statusCode),
    };

    const level = resolveAccessLogLevel(context.statusCode);
    if (level === 'error') {
      this.logger.error(message, accessMeta);
      return;
    }
    if (level === 'warn') {
      this.logger.warn(message, accessMeta);
      return;
    }
    this.logger.info(message, accessMeta);
  }
}
