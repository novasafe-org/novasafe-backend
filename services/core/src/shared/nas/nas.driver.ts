import type {
  StorageDriver,
  StorageUploadInput,
  StorageUploadResult,
} from '../storage/storage.types';
import { StorageError, StorageErrorCodes } from '../storage/storage.errors';
import { nasDeleteFile, nasDownloadFile, nasUploadFile } from './nas.client';

/**
 * NAS-Control implementation of the generic StorageDriver.
 */
export const createNasStorageDriver = (): StorageDriver => ({
  name: 'nas',

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const meta = await nasUploadFile({
      filename: input.filename,
      mimeType: input.mimeType,
      buffer: input.buffer,
      relativePath: input.relativePath,
    });
    if (!meta.id) {
      throw new StorageError(
        'Document storage error. Please try again.',
        502,
        StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
      );
    }
    return {
      storageKey: meta.id,
      mimeType: meta.mime_type ?? input.mimeType ?? null,
      sizeBytes: meta.size,
      originalFilename: meta.original_filename,
    };
  },

  async download(storageKey: string): Promise<Response> {
    return nasDownloadFile(storageKey);
  },

  async delete(storageKey: string): Promise<void> {
    await nasDeleteFile(storageKey);
  },
});
