/**
 * Load `.env` before any other app modules read `process.env`.
 * Lambda bundles the same VPS-format `.env` via scripts/package-lambda.mjs.
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
