import '../loadEnv';

import { connectMongo, disconnectMongo } from '../database/mongo';
import { ensureRbacIndexes, seedRbac } from '../modules/rbac/rbac.service';
import { logger } from '../shared/logger';

async function main(): Promise<void> {
  await connectMongo();
  await ensureRbacIndexes();
  await seedRbac();
  logger.info('Admin RBAC seed complete');
  await disconnectMongo();
}

main().catch((err) => {
  logger.error('Admin seed failed', { err });
  process.exit(1);
});
