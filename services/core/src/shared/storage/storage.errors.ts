import { AppError } from '../errors';

/**
 * Generic storage / document error codes — safe for API responses.
 * Driver-specific (NAS, S3, …) mapping happens inside the driver package.
 */
export const StorageErrorCodes = {
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  STORAGE_AUTH_FAILED: 'STORAGE_AUTH_FAILED',
  STORAGE_MISCONFIGURED: 'STORAGE_MISCONFIGURED',
  STORAGE_FORBIDDEN: 'STORAGE_FORBIDDEN',
  STORAGE_UPSTREAM_ERROR: 'STORAGE_UPSTREAM_ERROR',
  STORAGE_OBJECT_NOT_FOUND: 'STORAGE_OBJECT_NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_INVALID_UPLOAD: 'DOCUMENT_INVALID_UPLOAD',
  DOCUMENT_TOO_LARGE: 'DOCUMENT_TOO_LARGE',
  DOCUMENT_CONFLICT: 'DOCUMENT_CONFLICT',
  DOCUMENT_INVALID_ID: 'DOCUMENT_INVALID_ID',
} as const;

export type StorageErrorCode = (typeof StorageErrorCodes)[keyof typeof StorageErrorCodes];

export class StorageError extends AppError {
  constructor(message: string, statusCode: number, code: StorageErrorCode) {
    super(message, statusCode, code);
    this.name = 'StorageError';
  }
}
