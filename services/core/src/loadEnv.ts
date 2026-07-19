/**
 * Load env before any other app modules read `process.env`.
 *
 * Prefers `.env.local` (local debug) then falls back to `.env`.
 * Docker/VPS: reads from the working directory or next to compiled output.
 * Lambda: `.env` is bundled at the package root by `scripts/package-lambda.mjs`
 * (same dotenv format as VPS — no separate Lambda config layer).
 */
import dotenv from 'dotenv';
import path from 'path';

const envBases = [
  path.resolve(process.cwd()),
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../..'),
];

const envFilenames = ['.env.local', '.env'];

let loaded = false;
for (const base of envBases) {
  for (const filename of envFilenames) {
    const envPath = path.join(base, filename);
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      loaded = true;
      break;
    }
  }
  if (loaded) break;
}

// Initialize logging immediately after env is loaded (before other modules use logger).
import { LoggerManager } from './shared/logger/managers/logger.manager';
LoggerManager.getInstance().initialize();
