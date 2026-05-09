import dotenv from 'dotenv';
import path from 'path';
import app from './app';
import Database from './database/connection';
import { DB_CONFIG } from './config/dbConfig';
import logger from './logger';
import { ensureSubscriptionIndexes } from './services/subscriptionService';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) break;
}

const PORT = process.env.MOBILE_VAULT_PORT || process.env.PORT || 3124;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

const initializeDatabase = async () => {
  try {
    new Database(DB_CONFIG.databaseName);
    await ensureSubscriptionIndexes();
    logger.info('MongoDB connection status: connected');
  } catch (error: any) {
    logger.error({ error: error?.message }, 'MongoDB connection status: failed');
    throw error;
  }
};

export const startServer = async () => {
  await initializeDatabase();

  app.listen(Number(PORT), BIND_HOST, () => {
    logger.info(`Mobile vault service running on port ${PORT} (bind: ${BIND_HOST})`);
  });
};
