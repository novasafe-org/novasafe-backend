/** Docker / VPS / local process entry — do not replace with Lambda handler. */
import './loadEnv';

import { startServer } from './server';
import { logger } from './shared/logger';

startServer().catch((err) => {
  logger.error('Failed to start admin-app', { err });
  process.exit(1);
});
