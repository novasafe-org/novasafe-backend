import type { ErrorRequestHandler, Express, RequestHandler } from 'express';
import {
  createErrorLoggerMiddleware,
  createRequestLoggerMiddleware,
} from '../middleware';

export interface ExpressLoggingOptions {
  request?: boolean;
  error?: boolean;
}

/**
 * Applies request logging middleware to Express.
 * Register {@link getExpressErrorLogger} after routes, before the final error handler.
 */
export const applyExpressLogging = (
  app: Express,
  options: ExpressLoggingOptions = { request: true },
): void => {
  if (options.request !== false) {
    app.use(createRequestLoggerMiddleware());
  }
};

export const getExpressErrorLogger = (): ErrorRequestHandler =>
  createErrorLoggerMiddleware() as ErrorRequestHandler;

export const getRequestLoggerMiddleware = (): RequestHandler =>
  createRequestLoggerMiddleware();
