import { NextFunction, Request, Response } from 'express';
import logger from '../logger';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    source: req.source || 'mobile',
    message: 'Route not found',
  });
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = err?.statusCode || 500;
  logger.error({ err, path: req.originalUrl, method: req.method }, 'Mobile vault request failed');

  res.status(status).json({
    success: false,
    source: req.source || 'mobile',
    message: err?.message || 'Internal server error',
  });
};
