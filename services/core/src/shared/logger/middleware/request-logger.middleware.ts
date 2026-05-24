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

    const originalJson = res.json.bind(res);
    res.json = function captureJsonBody(this: Response, body: unknown) {
      const status = res.statusCode;
      if (status >= 400 && body && typeof body === 'object') {
        const payload = body as Record<string, unknown>;
        if (typeof payload.message === 'string') {
          res.locals.responseMessage = payload.message;
        }
        if (typeof payload.code === 'string') {
          res.locals.responseCode = payload.code;
        }
      }
      return originalJson(body);
    };

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
      const isSyncSettingsPath = req.path.endsWith('/sync') || req.originalUrl.includes('/settings/sync');
      const responseMessage =
        typeof res.locals?.responseMessage === 'string' ? res.locals.responseMessage : undefined;
      const responseCode =
        typeof res.locals?.responseCode === 'string' ? res.locals.responseCode : undefined;

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
        userId: platformCtx?.userId,
        ...(isSyncSettingsPath ? { context: 'settings-sync' } : {}),
        responseMessage,
        responseCode,
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
