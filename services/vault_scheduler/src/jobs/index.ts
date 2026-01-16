/**
 * Jobs Index
 * 
 * Central registry for all scheduled jobs.
 * Export all job functions here for easy importing.
 */

export { softDeleteCleanupJob } from './softDeleteCleanup.job';

// Future jobs can be added here:
// export { secretExpiryJob } from './secretExpiry.job';
// export { tokenRotationJob } from './tokenRotation.job';
// export { trialExpirationJob } from './trialExpiration.job';
// export { sessionCleanupJob } from './sessionCleanup.job';
// export { auditLogRetentionJob } from './auditLogRetention.job';
// export { notificationDispatchJob } from './notificationDispatch.job';

