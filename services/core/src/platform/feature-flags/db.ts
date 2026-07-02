import mongoose from 'mongoose';

import type { FeatureFlagEnvironment } from '@novasafe/feature-flags';

/** Admin-api writes feature flags to this database; mobile-api must read the same store. */
export const resolveFeatureFlagsDbName = (): string =>
  process.env.FEATURE_FLAGS_DB_NAME?.trim() ||
  process.env.ADMIN_DATABASE_NAME?.trim() ||
  'novasafe';

export type FeatureFlagDbRecord = {
  key: string;
  environment: FeatureFlagEnvironment;
  enabled: boolean;
  version?: number;
};

export const getFeatureFlagsCollection = (collectionName: string) => {
  const client = mongoose.connection.getClient();
  return client.db(resolveFeatureFlagsDbName()).collection<FeatureFlagDbRecord>(collectionName);
};
