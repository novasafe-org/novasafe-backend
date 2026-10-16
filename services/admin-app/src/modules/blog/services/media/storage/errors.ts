import { AppError } from "@/lib/errors";
import { HTTP } from "@/lib/constants";

export const MEDIA_STORAGE_ERROR_CODES = {
  CONFIG: "MEDIA_STORAGE_CONFIG",
  NOT_FOUND: "MEDIA_STORAGE_NOT_FOUND",
  AUTH: "MEDIA_STORAGE_AUTH",
  QUOTA: "MEDIA_STORAGE_QUOTA",
  RATE_LIMIT: "MEDIA_STORAGE_RATE_LIMIT",
  PROVIDER: "MEDIA_STORAGE_PROVIDER",
} as const;

export type MediaStorageErrorCode =
  (typeof MEDIA_STORAGE_ERROR_CODES)[keyof typeof MEDIA_STORAGE_ERROR_CODES];

export class MediaStorageError extends AppError {
  readonly providerId: string;

  constructor(
    message: string,
    options: {
      code: MediaStorageErrorCode;
      providerId: string;
      status?: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, {
      status: options.status ?? HTTP.SERVICE_UNAVAILABLE,
      code: options.code,
      details: options.details,
    });
    this.name = "MediaStorageError";
    this.providerId = options.providerId;
  }
}

export function isMediaStorageError(error: unknown): error is MediaStorageError {
  return error instanceof MediaStorageError;
}
