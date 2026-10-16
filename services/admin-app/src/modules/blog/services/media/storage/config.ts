export type MediaStorageProviderKind = "local" | "google_drive";

export type MediaStorageConfig = {
  provider: MediaStorageProviderKind;
  localPath: string;
  googleDrive?: {
    folderId: string;
    credentialsJson: string;
  };
  cache: {
    enabled: boolean;
    ttlMs: number;
    maxEntries: number;
    maxBytes: number;
  };
};

function readGoogleCredentialsJson(): string | undefined {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return inline;

  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  return undefined;
}

export function loadMediaStorageConfig(): MediaStorageConfig {
  const providerRaw = (process.env.MEDIA_PROVIDER ?? "local").trim().toLowerCase();
  const provider: MediaStorageProviderKind =
    providerRaw === "google_drive" || providerRaw === "gdrive" || providerRaw === "drive"
      ? "google_drive"
      : "local";

  const cacheEnabled =
    process.env.MEDIA_STORAGE_CACHE_ENABLED?.trim() !== "false" && provider === "google_drive";

  const config: MediaStorageConfig = {
    provider,
    localPath: process.env.MEDIA_STORAGE_PATH ?? "./uploads",
    cache: {
      enabled: cacheEnabled,
      ttlMs: Number.parseInt(process.env.MEDIA_STORAGE_CACHE_TTL_MS ?? "900000", 10),
      maxEntries: Number.parseInt(process.env.MEDIA_STORAGE_CACHE_MAX_ENTRIES ?? "64", 10),
      maxBytes: Number.parseInt(process.env.MEDIA_STORAGE_CACHE_MAX_BYTES ?? "67108864", 10),
    },
  };

  if (provider === "google_drive") {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    const credentialsJson = readGoogleCredentialsJson();

    if (!folderId) {
      throw new Error(
        "MEDIA_PROVIDER=google_drive requires GOOGLE_DRIVE_FOLDER_ID (shared Drive folder id)",
      );
    }
    if (!credentialsJson) {
      throw new Error(
        "MEDIA_PROVIDER=google_drive requires GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
      );
    }

    config.googleDrive = { folderId, credentialsJson };
  }

  return config;
}
