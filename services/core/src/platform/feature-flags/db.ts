import mongoose from 'mongoose';

/** Admin-api writes feature flags to this database; mobile-api must read the same store. */
export const resolveFeatureFlagsDbName = (): string =>
  process.env.FEATURE_FLAGS_DB_NAME?.trim() ||
  process.env.ADMIN_DATABASE_NAME?.trim() ||
  'novasafe';

export const getFeatureFlagsCollection = (collectionName: string) => {
  const client = mongoose.connection.getClient();
  return client.db(resolveFeatureFlagsDbName()).collection(collectionName);
};
