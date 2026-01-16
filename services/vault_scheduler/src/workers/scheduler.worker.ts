/**
 * Scheduler Worker
 * 
 * BullMQ worker that processes scheduled jobs.
 * Handles job execution, retries, and error handling.
 */

import { Worker, WorkerOptions } from 'bullmq';
import { schedulerConfig } from '../config/scheduler.config';
import logger from '../logger';
import { softDeleteCleanupJob } from '../jobs/softDeleteCleanup.job';

const workerOptions: WorkerOptions = {
  connection: {
    host: schedulerConfig.redis.host,
    port: schedulerConfig.redis.port,
    password: schedulerConfig.redis.password,
    db: schedulerConfig.redis.db,
  },
  concurrency: 5, // Process up to 5 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs per interval
    duration: 1000, // Per 1 second
  },
};

export const schedulerWorker = new Worker('scheduler', async (job) => {
  logger.info(`Processing job: ${job.name} (ID: ${job.id})`);

  try {
    switch (job.name) {
      case 'soft_delete_cleanup':
        await softDeleteCleanupJob(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }

    logger.info(`Job ${job.name} (ID: ${job.id}) completed successfully`);
  } catch (error: any) {
    logger.error(`Job ${job.name} (ID: ${job.id}) failed: ${error.message}`);
    throw error; // Re-throw to trigger retry mechanism
  }
}, workerOptions);

// Worker event handlers
schedulerWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

schedulerWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

schedulerWorker.on('error', (err) => {
  logger.error(`Worker error: ${err.message}`);
});

logger.info('Scheduler worker initialized');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing scheduler worker...');
  await schedulerWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Closing scheduler worker...');
  await schedulerWorker.close();
  process.exit(0);
});

