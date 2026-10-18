import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

import {
  MEDIA_STORAGE_ERROR_CODES,
  MediaStorageError,
} from "../media/storage/errors";

export type DriveFileMetadata = {
  id: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
};

export type DriveFileContent = {
  buffer: Buffer;
  mimeType: string;
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

export function mapDriveError(error: unknown): MediaStorageError {
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

export class GoogleDriveBlogImagesClient {
  private drive: drive_v3.Drive | null = null;

  constructor(private readonly credentialsJson: string) {}

  private getClient(): drive_v3.Drive {
    if (this.drive) return this.drive;

    const credentials = parseCredentials(this.credentialsJson);
    const auth = new google.auth.JWT({
      email: String(credentials.client_email),
      key: String(credentials.private_key),
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      ],
    });

    this.drive = google.drive({ version: "v3", auth });
    return this.drive;
  }

  async getMetadata(fileId: string): Promise<DriveFileMetadata | null> {
    try {
      const drive = this.getClient();
      const response = await drive.files.get({
        fileId,
        fields: "id,mimeType,parents,trashed",
        supportsAllDrives: true,
      });

      const data = response.data;
      if (!data.id) return null;

      return {
        id: data.id,
        mimeType: data.mimeType ?? "application/octet-stream",
        parents: data.parents ?? [],
        trashed: Boolean(data.trashed),
      };
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      const mapped = mapDriveError(error);
      if (mapped.code === MEDIA_STORAGE_ERROR_CODES.NOT_FOUND) return null;
      throw mapped;
    }
  }

  async download(fileId: string): Promise<DriveFileContent> {
    try {
      const drive = this.getClient();
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
      throw mapDriveError(error);
    }
  }
}
