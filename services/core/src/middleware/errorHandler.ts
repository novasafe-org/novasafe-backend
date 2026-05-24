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
    err: err.message,
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
