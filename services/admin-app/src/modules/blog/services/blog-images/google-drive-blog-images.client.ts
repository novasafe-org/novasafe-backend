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
        // drive.file alone cannot list/read files uploaded by humans into a shared folder
        "https://www.googleapis.com/auth/drive.readonly",
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

  /**
   * One Drive list call for all `{slug}.{ext}` candidates inside approved folders.
   */
  async findImageFileIdForSlug(
    folderIds: readonly string[],
    filenamesInPriorityOrder: readonly string[],
  ): Promise<string | null> {
    if (folderIds.length === 0 || filenamesInPriorityOrder.length === 0) return null;

    try {
      const drive = this.getClient();
      const nameClause = filenamesInPriorityOrder
        .map((name) => `name = '${name.replace(/'/g, "\\'")}'`)
        .join(" or ");
      const parentClause = folderIds.map((id) => `'${id.replace(/'/g, "\\'")}' in parents`).join(" or ");
      const q = `trashed = false and (${nameClause}) and (${parentClause})`;

      const response = await drive.files.list({
        q,
        fields: "files(id,name,mimeType)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: filenamesInPriorityOrder.length,
      });

      const files = response.data.files ?? [];
      const byName = new Map(files.filter((f) => f.id && f.name).map((f) => [f.name!, f.id!]));

      for (const filename of filenamesInPriorityOrder) {
        const id = byName.get(filename);
        if (id) return id;
      }

      return null;
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      throw mapDriveError(error);
    }
  }

  async findFileIdByNameInFolders(folderIds: readonly string[], filename: string): Promise<string | null> {
    if (folderIds.length === 0) return null;

    try {
      const drive = this.getClient();
      const parentClause = folderIds.map((id) => `'${id.replace(/'/g, "\\'")}' in parents`).join(" or ");
      const safeName = filename.replace(/'/g, "\\'");
      const q = `name = '${safeName}' and trashed = false and (${parentClause})`;

      const response = await drive.files.list({
        q,
        fields: "files(id,mimeType)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 5,
      });

      const files = response.data.files ?? [];
      const image = files.find((f) => f.id && (f.mimeType ?? "").startsWith("image/"));
      return image?.id ?? files[0]?.id ?? null;
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      throw mapDriveError(error);
    }
  }

  async findFileIdByNameWithAncestorCheck(
    filename: string,
    _allowedFolderIds: ReadonlySet<string> | readonly string[],
    isAllowed: (parentIds: string[]) => Promise<boolean>,
  ): Promise<string | null> {
    try {
      const drive = this.getClient();
      const safeName = filename.replace(/'/g, "\\'");
      const response = await drive.files.list({
        q: `name = '${safeName}' and trashed = false`,
        fields: "files(id,mimeType,parents)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 20,
      });

      for (const file of response.data.files ?? []) {
        if (!file.id) continue;
        const mime = file.mimeType ?? "";
        if (!mime.startsWith("image/")) continue;
        const parents = file.parents ?? [];
        if (parents.length === 0) continue;
        if (await isAllowed(parents)) return file.id;
      }

      return null;
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      throw mapDriveError(error);
    }
  }

  async getParentFolderIds(folderId: string): Promise<string[]> {
    try {
      const drive = this.getClient();
      const response = await drive.files.get({
        fileId: folderId,
        fields: "parents",
        supportsAllDrives: true,
      });
      return response.data.parents ?? [];
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      const mapped = mapDriveError(error);
      if (mapped.code === MEDIA_STORAGE_ERROR_CODES.NOT_FOUND) return [];
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
