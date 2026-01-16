/**
 * Soft Delete Cleanup Job
 * 
 * Permanently deletes items that have been soft-deleted for more than 30 days.
 * 
 * Job Logic:
 * - Finds items where deleted = false AND deleted_at IS NOT NULL
 * - Checks if deleted_at is older than retention period (default: 30 days)
 * - Sets deleted = true for those items (permanent deletion)
 * 
 * This job is idempotent and safe to re-run.
 */

import { Job } from 'bullmq';
import { getDatabase } from '../db/connection';
import logger from '../logger';
import { schedulerConfig } from '../config/scheduler.config';
import { ObjectId } from 'mongodb';

interface SoftDeleteCleanupJobData {
  retentionDays?: number;
}

export const softDeleteCleanupJob = async (data: SoftDeleteCleanupJobData = {}): Promise<void> => {
  const startTime = Date.now();
  const retentionDays = data.retentionDays || schedulerConfig.jobs.softDeleteCleanup.retentionDays;
  
  logger.info(`Starting soft-delete cleanup job (retention: ${retentionDays} days)`);

  try {
    const db = getDatabase();
    const collection = db.collection('vaultItems');

    // Calculate cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`Cutoff date: ${cutoffDate.toISOString()}`);

    // Find items that are soft-deleted (deleted = false, deleted_at is set)
    // and have been in trash for more than retention period
    const query = {
      deleted: false,
      deleted_at: { $ne: null, $lte: cutoffDate },
    };

    // Count items to be permanently deleted
    const countResult = await collection.countDocuments(query);
    logger.info(`Found ${countResult} items to permanently delete`);

    if (countResult === 0) {
      logger.info('No items to clean up');
      return;
    }

    // Update items: Set deleted = true (permanent deletion)
    // This marks them as permanently deleted
    const updateResult = await collection.updateMany(
      query,
      {
        $set: {
          deleted: true,
          permanently_deleted_at: new Date(),
        },
      }
    );

    const duration = Date.now() - startTime;
    logger.info({
      itemsProcessed: updateResult.modifiedCount,
      itemsMatched: updateResult.matchedCount,
      duration: `${duration}ms`,
    }, `Soft-delete cleanup completed ✅`);

    // Log summary
    if (updateResult.modifiedCount > 0) {
      logger.info(
        `Permanently deleted ${updateResult.modifiedCount} items that were in trash for more than ${retentionDays} days`
      );
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    }, 'Soft-delete cleanup job failed ❌');
    throw error;
  }
};

