import { Readable } from "node:stream";

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

import {
  MEDIA_STORAGE_ERROR_CODES,
  MediaStorageError,
} from "./errors";
import { buildGoogleDriveStorageKey, googleDriveFileId } from "./keys";
import type { MediaStorageProvider, MediaStoragePutInput, StoredFile } from "./types";

export type GoogleDriveStorageConfig = {
  folderId: string;
  credentialsJson: string;
};

function parseCredentials(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("client_email and private_key are required");
    }
    return parsed;
  } catch (error) {
    throw new MediaStorageError("Invalid GOOGLE_SERVICE_ACCOUNT_JSON", {
      code: MEDIA_STORAGE_ERROR_CODES.CONFIG,
      providerId: "google_drive",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function mapDriveError(error: unknown): MediaStorageError {
  const err = error as { code?: number | string; message?: string; errors?: Array<{ reason?: string }> };
  const reason = err.errors?.[0]?.reason ?? "";
  const message = err.message ?? "Google Drive request failed";
  const status = typeof err.code === "number" ? err.code : undefined;

  if (status === 401 || status === 403 || reason === "authError") {
    return new MediaStorageError(
      "Google Drive authentication failed. Share the upload folder with the service account email.",
      {
        code: MEDIA_STORAGE_ERROR_CODES.AUTH,
        providerId: "google_drive",
        status: 503,
        details: { message, reason },
      },
    );
  }
  if (status === 404 || reason === "notFound") {
    return new MediaStorageError("Google Drive file or folder not found", {
      code: MEDIA_STORAGE_ERROR_CODES.NOT_FOUND,
      providerId: "google_drive",
      status: 404,
      details: { message, reason },
    });
  }
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded") {
    return new MediaStorageError("Google Drive storage quota exceeded", {
      code: MEDIA_STORAGE_ERROR_CODES.QUOTA,
      providerId: "google_drive",
      status: 503,
      details: { message, reason },
    });
  }
  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new MediaStorageError("Google Drive rate limit exceeded; retry later", {
      code: MEDIA_STORAGE_ERROR_CODES.RATE_LIMIT,
      providerId: "google_drive",
      status: 503,
      details: { message, reason },
    });
  }

  return new MediaStorageError(message, {
    code: MEDIA_STORAGE_ERROR_CODES.PROVIDER,
    providerId: "google_drive",
    status: 503,
    details: { message, reason, status },
  });
}

export class GoogleDriveMediaStorageProvider implements MediaStorageProvider {
  readonly providerId = "google_drive";

  private drive: drive_v3.Drive | null = null;

  constructor(private readonly config: GoogleDriveStorageConfig) {}

  private getClient(): drive_v3.Drive {
    if (this.drive) return this.drive;

    const credentials = parseCredentials(this.config.credentialsJson);
    const auth = new google.auth.JWT({
      email: String(credentials.client_email),
      key: String(credentials.private_key),
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    this.drive = google.drive({ version: "v3", auth });
    return this.drive;
  }

  async put(input: MediaStoragePutInput) {
    try {
      const drive = this.getClient();
      const response = await drive.files.create({
        requestBody: {
          name: input.filename,
          parents: [this.config.folderId],
        },
        media: {
          mimeType: input.mimeType,
          body: Readable.from(input.buffer),
        },
        fields: "id",
        supportsAllDrives: true,
      });

      const fileId = response.data.id;
      if (!fileId) {
        throw new MediaStorageError("Google Drive upload returned no file id", {
          code: MEDIA_STORAGE_ERROR_CODES.PROVIDER,
          providerId: this.providerId,
        });
      }

      return { storageKey: buildGoogleDriveStorageKey(fileId) };
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      throw mapDriveError(error);
    }
  }

  async get(storageKey: string): Promise<StoredFile | null> {
    try {
      const drive = this.getClient();
      const fileId = googleDriveFileId(storageKey);
      const response = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);
      const mimeType =
        (response.headers["content-type"] as string | undefined)?.split(";")[0]?.trim() ??
        "application/octet-stream";

      return { buffer, mimeType };
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      const mapped = mapDriveError(error);
      if (mapped.code === MEDIA_STORAGE_ERROR_CODES.NOT_FOUND) return null;
      throw mapped;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const drive = this.getClient();
      const fileId = googleDriveFileId(storageKey);
      await drive.files.delete({ fileId, supportsAllDrives: true });
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      const mapped = mapDriveError(error);
      if (mapped.code === MEDIA_STORAGE_ERROR_CODES.NOT_FOUND) return;
      throw mapped;
    }
  }

  async healthCheck() {
    try {
      const drive = this.getClient();
      await drive.files.get({
        fileId: this.config.folderId,
        fields: "id,name",
        supportsAllDrives: true,
      });
      return { ok: true, provider: this.providerId };
    } catch (error) {
      const mapped = error instanceof MediaStorageError ? error : mapDriveError(error);
      return {
        ok: false,
        provider: this.providerId,
        detail: mapped.message,
      };
    }
  }
}
