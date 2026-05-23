import type { LoggerConfig } from '../config';
import type { LogMeta } from '../core/logger.types';
import { categorizeError, parseStack } from '../utils/stack-parser.util';

export const formatErrorMeta = (error: Error, config: LoggerConfig): LogMeta => {
  const meta: LogMeta = {
    error: {
      name: error.name,
      message: error.message,
      category: categorizeError(error),
    },
  };

  if (config.enableErrorStack && error.stack) {
    meta.stack = error.stack;
    meta.frames = parseStack(error.stack) as unknown as LogMeta['frames'];
  }

  return meta;
};
