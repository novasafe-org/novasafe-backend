/**
 * Scheduler Queue
 * 
 * BullMQ queue configuration for background jobs.
 * This queue handles all scheduled and background tasks.
 */

import { Queue, QueueOptions } from 'bullmq';
import { schedulerConfig } from '../config/scheduler.config';
import logger from '../logger';

const queueOptions: QueueOptions = {
  connection: {
    host: schedulerConfig.redis.host,
    port: schedulerConfig.redis.port,
    password: schedulerConfig.redis.password,
    db: schedulerConfig.redis.db,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

export const schedulerQueue = new Queue('scheduler', queueOptions);

logger.info('Scheduler queue initialized');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing scheduler queue...');
  await schedulerQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Closing scheduler queue...');
  await schedulerQueue.close();
  process.exit(0);
});

