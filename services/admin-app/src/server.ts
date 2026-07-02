import app, { initializeApp } from './app';
import { connectMongo } from './database/mongo';
import {
  ensureFeatureFlagIndexes,
  seedFeatureFlagsFromCatalog,
} from './modules/feature-flags/feature-flags.service';
import { ensureRbacIndexes, seedRbac } from './modules/rbac/rbac.service';
import { logger } from './shared/logger';

const PORT = Number(process.env.ADMIN_PORT || process.env.PORT || 3130);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

let httpServer: import('http').Server | null = null;

export async function startServer(): Promise<import('http').Server> {
  await connectMongo();
  await ensureRbacIndexes();
  await seedRbac();
  await ensureFeatureFlagIndexes();
  await seedFeatureFlagsFromCatalog();
  await initializeApp();

  return new Promise((resolve, reject) => {
    httpServer = app.listen(PORT, BIND_HOST, () => {
      logger.info(`Admin API listening on http://${BIND_HOST}:${PORT}`);
      resolve(httpServer!);
    });
    httpServer.on('error', reject);
  });
}

export async function stopServer(): Promise<void> {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((err) => (err ? reject(err) : resolve()));
  });
  httpServer = null;
  const { disconnectMongo } = await import('./database/mongo');
  await disconnectMongo();
}
