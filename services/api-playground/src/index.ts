import './loadEnv';
import { startServer } from './server';
import { logger } from './utils/logger';

startServer().catch((error) => {
  logger.error('Failed to start API Playground', { error: String(error) });
  process.exit(1);
});
