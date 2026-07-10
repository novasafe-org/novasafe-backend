/** Docker / VPS / local process entry — do not replace with Lambda handler. */
import './loadEnv';
import { registerGracefulShutdown } from './shutdown';
import { startServer } from './server';
import { logger } from './shared/logger';

registerGracefulShutdown();

startServer().catch((error) => {
  logger.error('Failed to start core service', { err: (error as Error).message });
  process.exit(1);
});
