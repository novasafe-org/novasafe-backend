import type { NextFunction, Request, Response } from 'express';
import { LoggerContext } from '../core/logger.context';
import { formatErrorMeta } from '../formatters';
import { LoggerManager } from '../managers/logger.manager';

export const createErrorLoggerMiddleware = () => {
  const manager = LoggerManager.getInstance();
  const config = manager.getConfig();
  const logger = manager.getLogger();

  return (err: Error, req: Request, _res: Response, next: NextFunction): void => {
    const requestId = LoggerContext.getRequestId();
    const errorMeta = formatErrorMeta(err, config);

    logger.error('Request failed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      ...errorMeta,
    });

    next(err);
  };
};

export const errorLoggerMiddleware = createErrorLoggerMiddleware();
