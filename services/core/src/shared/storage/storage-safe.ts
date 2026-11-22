import { logger } from '../logger';
import { AppError } from '../errors';
import { getStorage } from './storage.factory';
import { StorageError, StorageErrorCodes } from './storage.errors';
import type { StorageUploadInput, StorageUploadResult } from './storage.types';

const isMissingObject = (err: unknown): boolean => {
  if (!(err instanceof AppError)) return false;
  return (
    err.statusCode === 404 ||
    err.code === StorageErrorCodes.STORAGE_OBJECT_NOT_FOUND ||
    err.code === StorageErrorCodes.DOCUMENT_NOT_FOUND ||
    err.code === StorageErrorCodes.ATTACHMENT_NOT_FOUND
  );
};

/** Re-throw StorageError; wrap unknowns as STORAGE_UPSTREAM_ERROR (no raw FS leakage). */
export const toStorageError = (err: unknown, fallbackMessage: string): StorageError => {
  if (err instanceof StorageError) return err;
  if (err instanceof AppError) {
    const detail = `${err.code}: ${err.message}`;
    logger.error('Storage operation failed', { detail, fallbackMessage });
    return new StorageError(
      err.message || fallbackMessage,
      err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502,
      StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
    );
  }
  const detail = err instanceof Error ? err.message : String(err);
  logger.error('Storage operation failed', { detail, fallbackMessage });
  return new StorageError(fallbackMessage, 502, StorageErrorCodes.STORAGE_UPSTREAM_ERROR);
};

export const safeStorageUpload = async (
  input: StorageUploadInput,
): Promise<StorageUploadResult> => {
  try {
    return await getStorage().upload(input);
  } catch (err) {
    throw toStorageError(err, 'Could not upload the file. Please try again.');
  }
};

export const safeStorageDownload = async (storageKey: string): Promise<Response> => {
  try {
    return await getStorage().download(storageKey);
  } catch (err) {
    throw toStorageError(err, 'Could not download the file. Please try again.');
  }
};

/**
 * Best-effort NAS delete. Missing objects are ignored.
 * Other failures are logged and returned as `false` (caller may still soft-delete).
 */
export const safeStorageDeleteBestEffort = async (
  storageKey: string,
  context: Record<string, unknown> = {},
): Promise<boolean> => {
  try {
    await getStorage().delete(storageKey);
    return true;
  } catch (err) {
    if (isMissingObject(err)) return true;
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn('NAS delete failed; continuing with soft-delete', {
      ...context,
      storageKey,
      detail,
    });
    return false;
  }
};
