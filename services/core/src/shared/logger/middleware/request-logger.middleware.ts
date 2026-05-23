import type { NextFunction, Request, Response } from 'express';
import { RequestContextManager } from '../../request-context/context/request-context.manager';
import { LoggerContext } from '../core/logger.context';
import { LoggerManager } from '../managers/logger.manager';
import { extractCorrelationId, extractRequestId } from '../utils/request-id.util';
import { redactSensitive } from '../utils/sanitize.util';

const resolveClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

export const createRequestLoggerMiddleware = () => {
  const manager = LoggerManager.getInstance();
  const config = manager.getConfig();
  const requestLogger = manager.getRequestLogger();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.enableRequest) {
      next();
      return;
    }

    const platformCtx = RequestContextManager.getData();
    const requestId =
      platformCtx?.requestId ?? extractRequestId(req.headers as Record<string, unknown>);
    const correlationId =
      platformCtx?.correlationId ?? extractCorrelationId(req.headers as Record<string, unknown>);
    const startedAt = process.hrtime.bigint();

    if (!platformCtx) {
      res.setHeader('x-request-id', requestId);
      if (correlationId) {
        res.setHeader('x-correlation-id', correlationId);
      }
    }

    const logCompletion = () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const body =
        config.requestBody && req.body
          ? redactSensitive(req.body, config.sensitiveFields)
          : undefined;

      requestLogger.logCompleted({
        requestId,
        correlationId,
        method: req.method,
        url: req.originalUrl,
        path: req.path,
        ip: resolveClientIp(req),
        userAgent: req.headers['user-agent'],
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        contentLength: Number(res.getHeader('content-length')) || undefined,
        source: platformCtx?.source,
        platform: platformCtx?.platform,
        legacySource: platformCtx?.legacySource,
        ...(body ? { body } : {}),
      });
    };

    const finish = () => {
      res.on('finish', logCompletion);
      next();
    };

    if (platformCtx) {
      finish();
      return;
    }

    LoggerContext.run(
      {
        requestId,
        correlationId,
        request: {
          requestId,
          correlationId,
          method: req.method,
          url: req.originalUrl,
          path: req.path,
          ip: resolveClientIp(req),
          userAgent: req.headers['user-agent'],
        },
      },
      finish,
    );
  };
};

export const requestLoggerMiddleware = createRequestLoggerMiddleware();
