import './loadEnv';
import { initializeFeatureFlagCatalog } from './platform/feature-flags';
import { registerGracefulShutdown } from './shutdown';
import { startServer } from './server';
import { logger } from './shared/logger';

initializeFeatureFlagCatalog();

registerGracefulShutdown();

startServer().catch((error) => {
  logger.error('Failed to start core service', { err: (error as Error).message });
  process.exit(1);
});
