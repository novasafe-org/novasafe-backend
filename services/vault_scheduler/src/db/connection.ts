/**
 * Database Connection
 * 
 * Reusable MongoDB connection for scheduler jobs.
 * Uses the same connection pattern as the vault service.
 */

import { MongoClient, Db } from 'mongodb';
import { schedulerConfig } from '../config/scheduler.config';
import logger from '../logger';

let dbConnection: Db | null = null;
let client: MongoClient | null = null;

export const connectDatabase = async (): Promise<Db> => {
  if (dbConnection) {
    return dbConnection;
  }

  try {
    logger.info('Connecting to MongoDB...');

    const clientOptions = {
      retryWrites: true,
      retryReads: true,
      family: 4,
      compressors: ['snappy', 'zlib'] as ('snappy' | 'zlib')[],
    };

    client = new MongoClient(schedulerConfig.database.uri, clientOptions);
    await client.connect();
    await client.db('admin').command({ ping: 1 });

    dbConnection = client.db(schedulerConfig.database.databaseName);
    logger.info('Database connected ✅');

    return dbConnection;
  } catch (error: any) {
    logger.error(`MongoDB connection failed ❌: ${error.message}`);
    throw error;
  }
};

export const getDatabase = (): Db => {
  if (!dbConnection) {
    throw new Error('Database connection is not established. Call connectDatabase() first.');
  }
  return dbConnection;
};

export const closeDatabase = async (): Promise<void> => {
  if (client) {
    await client.close();
    dbConnection = null;
    client = null;
    logger.info('Database connection closed');
  }
};

