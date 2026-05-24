import { NextFunction, Request, Response } from 'express';
import { logger } from '../shared/logger';
import { toReadableError } from '../shared/logger/utils/readable-error.util';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const readable = toReadableError(err);

  logger.error(readable.message, {
    code: readable.code,
    category: readable.category,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    err: err.message,
    errName: err.name,
    ...(err.stack && process.env.LOG_ENABLE_ERROR_STACK === 'true'
      ? { stack: err.stack.split('\n').slice(0, 5).join('\n') }
      : {}),
  });

  if (res.headersSent) {
    return;
  }

  const status =
    readable.code === 'DATABASE_UNAVAILABLE'
      ? 503
      : readable.code === 'INVALID_TOKEN'
        ? 401
        : 500;

  res.status(status).json({
    success: false,
    message: readable.message,
    code: readable.code,
  });
};
