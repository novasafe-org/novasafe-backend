/**
 * Logger Configuration
 * 
 * Structured logging using Pino for scheduler service.
 */

import pino from 'pino';
import { schedulerConfig } from '../config/scheduler.config';

const logger = pino({
  level: schedulerConfig.logging.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;

