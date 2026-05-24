import type { NextFunction, Request, Response } from 'express';
import { LoggerContext } from '../core/logger.context';
import { LoggerManager } from '../managers/logger.manager';
import { toReadableError } from '../utils/readable-error.util';

export const createErrorLoggerMiddleware = () => {
  const manager = LoggerManager.getInstance();
  const logger = manager.getLogger();

  return (err: Error, req: Request, _res: Response, next: NextFunction): void => {
    const requestId = LoggerContext.getRequestId();
    const readable = toReadableError(err);

    logger.error(`Request failed: ${readable.message}`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      code: readable.code,
      category: readable.category,
      err: err.message,
    });

    next(err);
  };
};

export const errorLoggerMiddleware = createErrorLoggerMiddleware();
