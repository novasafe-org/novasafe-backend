import app from './app';
import Database from './database/connection';
import { DB_CONFIG } from './config/dbConfig';
import logger from './logger';
import { ensureSubscriptionIndexes } from './services/subscriptionService';

const PORT = process.env.MOBILE_VAULT_PORT || process.env.PORT || 3124;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

const initializeDatabase = async () => {
  try {
    // Database constructor kicks off async connect without awaiting — must await
    // explicitly before anything calls getDb() (e.g. ensureSubscriptionIndexes).
    const bootstrap = new Database(DB_CONFIG.databaseName);
    await bootstrap.connect();
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
