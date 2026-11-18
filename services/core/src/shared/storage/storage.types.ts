/**
 * Backend-agnostic object storage contract.
 * Implementations: NAS driver today; S3/MinIO later.
 */

export type StorageUploadInput = {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  /** Optional relative path hint for drivers that support folders. */
  relativePath?: string;
};

export type StorageUploadResult = {
  /** Opaque key persisted as documents.storageKey */
  storageKey: string;
  mimeType?: string | null;
  sizeBytes?: number;
  originalFilename?: string;
};

export interface StorageDriver {
  readonly name: string;
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  download(storageKey: string): Promise<Response>;
  delete(storageKey: string): Promise<void>;
}
