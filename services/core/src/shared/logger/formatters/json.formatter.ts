import winston from 'winston';
import type { LoggerConfig } from '../config';

export const createJsonFormat = (config: LoggerConfig) =>
  winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: config.enableErrorStack }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
    winston.format.json(),
  );
