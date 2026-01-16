/**
 * Vault Scheduler Service
 * 
 * Standalone background job scheduler for NovaSafe.
 * Handles all scheduled and background tasks decoupled from API services.
 * 
 * Initial Job: Soft-delete cleanup (30-day retention)
 * 
 * Usage:
 *   pnpm run start:scheduler
 * 
 * Environment Variables:
 *   - REDIS_HOST (default: localhost)
 *   - REDIS_PORT (default: 6379)
 *   - REDIS_PASSWORD (optional)
 *   - MONGODB_URI (required)
 *   - MONGODB_DATABASE (default: vault)
 *   - SOFT_DELETE_CLEANUP_ENABLED (default: true)
 *   - SOFT_DELETE_CLEANUP_INTERVAL (default: "0 * * * *" - hourly)
 *   - SOFT_DELETE_RETENTION_DAYS (default: 30)
 *   - LOG_LEVEL (default: info)
 */

import { connectDatabase, closeDatabase } from './db/connection';
import { schedulerWorker } from './workers/scheduler.worker';
import { schedulerQueue } from './queues/scheduler.queue';
import { schedulerConfig } from './config/scheduler.config';
import logger from './logger';

// Import job scheduler (we'll use a simple cron-like approach with BullMQ repeatable jobs)
// For now, we'll use a simple interval-based approach

/**
 * Register scheduled jobs
 */
const registerScheduledJobs = async () => {
  logger.info('Registering scheduled jobs...');

  // Soft Delete Cleanup Job
  if (schedulerConfig.jobs.softDeleteCleanup.enabled) {
    // Parse cron expression or interval
    const interval = schedulerConfig.jobs.softDeleteCleanup.interval;
    
    // Add as repeatable job
    await schedulerQueue.add(
      'soft_delete_cleanup',
      {
        retentionDays: schedulerConfig.jobs.softDeleteCleanup.retentionDays,
      },
      {
        repeat: {
          pattern: interval, // Cron expression
        },
        jobId: 'soft_delete_cleanup', // Unique ID to prevent duplicates
      }
    );

    logger.info(`Registered soft-delete cleanup job (interval: ${interval}, retention: ${schedulerConfig.jobs.softDeleteCleanup.retentionDays} days)`);
  }

  logger.info('All scheduled jobs registered ✅');
};

/**
 * Main entry point
 */
const start = async () => {
  try {
    logger.info('🚀 Starting Vault Scheduler Service...');

    // Connect to database
    await connectDatabase();
    logger.info('Database connected ✅');

    // Worker is already initialized (imported above)
    logger.info('Worker initialized ✅');

    // Register scheduled jobs
    await registerScheduledJobs();

    logger.info('✅ Vault Scheduler Service started successfully');
    logger.info(`   - Redis: ${schedulerConfig.redis.host}:${schedulerConfig.redis.port}`);
    logger.info(`   - Database: ${schedulerConfig.database.databaseName}`);
    logger.info(`   - Jobs enabled: ${Object.keys(schedulerConfig.jobs).filter(key => (schedulerConfig.jobs as any)[key].enabled).join(', ')}`);

    // Keep process alive
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await closeDatabase();
      await schedulerQueue.close();
      await schedulerWorker.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await closeDatabase();
      await schedulerQueue.close();
      await schedulerWorker.close();
      process.exit(0);
    });
  } catch (error: any) {
    logger.error(`Failed to start scheduler service: ${error.message}`);
    process.exit(1);
  }
};

// Start the service
start();

