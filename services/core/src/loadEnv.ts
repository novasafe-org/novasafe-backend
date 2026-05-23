/**
 * Load `.env` before any other app modules read `process.env`.
 */
import dotenv from 'dotenv';
import path from 'path';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) break;
}

// Initialize logging immediately after env is loaded (before other modules use logger).
import { LoggerManager } from './shared/logger/managers/logger.manager';
LoggerManager.getInstance().initialize();
