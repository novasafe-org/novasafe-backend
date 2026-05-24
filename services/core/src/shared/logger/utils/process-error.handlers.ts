import { toReadableError } from './readable-error.util';
import type { LoggerService } from '../services/logger.service';

let registered = false;

/**
 * Log unhandled rejections/exceptions with a short message (no raw driver dumps on stdout).
 */
export const registerProcessErrorHandlers = (logger: LoggerService): void => {
  if (registered) return;
  registered = true;

  const logFatal = (label: string, error: unknown) => {
    const readable = toReadableError(error);
    logger.error(`${label}: ${readable.message}`, {
      code: readable.code,
      category: readable.category,
      err: error instanceof Error ? error.message : String(error),
    });
  };

  process.on('unhandledRejection', (reason) => {
    logFatal('Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logFatal('Uncaught exception', error);
  });
};
