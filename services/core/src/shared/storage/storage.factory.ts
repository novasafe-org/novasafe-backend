import { createNasStorageDriver } from '../nas/nas.driver';
import { StorageError, StorageErrorCodes } from './storage.errors';
import type { StorageDriver } from './storage.types';

/**
 * Composition root: picks the storage driver from env.
 * Feature modules must call `getStorage()` — never import `shared/nas` directly.
 */
export const getStorage = (): StorageDriver => {
  const driver = (process.env.STORAGE_DRIVER || 'nas').trim().toLowerCase();

  if (driver === 'nas') {
    return createNasStorageDriver();
  }

  throw new StorageError(
    'Document storage is not configured.',
    503,
    StorageErrorCodes.STORAGE_MISCONFIGURED,
  );
};
