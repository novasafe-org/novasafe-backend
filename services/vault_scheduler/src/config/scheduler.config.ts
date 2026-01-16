/**
 * Scheduler Configuration
 * 
 * Centralized configuration for all scheduled jobs and queue settings.
 * All intervals and timeouts are configurable via environment variables.
 */

import dotenv from 'dotenv';

dotenv.config();

export interface SchedulerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  jobs: {
    softDeleteCleanup: {
      enabled: boolean;
      interval: string; // Cron expression or interval (e.g., "0 * * * *" for hourly, "0 0 * * *" for daily)
      retentionDays: number;
    };
  };
  database: {
    uri: string;
    databaseName: string;
    // Support vault service format
    username?: string;
    password?: string;
    host?: string;
  };
  logging: {
    level: string;
  };
}

export const schedulerConfig: SchedulerConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jobs: {
    softDeleteCleanup: {
      enabled: process.env.SOFT_DELETE_CLEANUP_ENABLED !== 'false', // Default: true
      interval: process.env.SOFT_DELETE_CLEANUP_INTERVAL || '0 * * * *', // Default: hourly
      retentionDays: parseInt(process.env.SOFT_DELETE_RETENTION_DAYS || '30', 10),
    },
  },
  database: {
    // Support both formats: full URI or individual components (vault service format)
    uri: process.env.MONGODB_URI || process.env.DATABASE_URI || 
      (process.env.VAULT_DB_USERNAME && process.env.VAULT_DB_PASSWORD && process.env.VAULT_DB_HOST
        ? `mongodb+srv://${process.env.VAULT_DB_USERNAME}:${process.env.VAULT_DB_PASSWORD}@${process.env.VAULT_DB_HOST}/${process.env.VAULT_DB_NAME || 'vault'}?retryWrites=true&w=majority`
        : ''),
    databaseName: process.env.MONGODB_DATABASE || process.env.DATABASE_NAME || process.env.VAULT_DB_NAME || 'vault',
    username: process.env.VAULT_DB_USERNAME,
    password: process.env.VAULT_DB_PASSWORD,
    host: process.env.VAULT_DB_HOST,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required configuration
if (!schedulerConfig.database.uri) {
  throw new Error(
    'MongoDB connection is required. Please provide either:\n' +
    '  - MONGODB_URI or DATABASE_URI (full connection string), OR\n' +
    '  - VAULT_DB_USERNAME, VAULT_DB_PASSWORD, VAULT_DB_HOST, and VAULT_DB_NAME (individual components)'
  );
}

