import { NextFunction, Request, Response } from 'express';
import { logger } from '../shared/logger';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }

  if (res.headersSent) {
    logger.error('Error after headers sent', { err: err.message });
  }
};
