import { CachingMediaStorageProvider } from "./cache";
import { MEDIA_STORAGE_ERROR_CODES, MediaStorageError } from "./errors";
import { GoogleDriveMediaStorageProvider } from "./google-drive.provider";
import { LocalMediaStorageProvider } from "./local.provider";
import type { MediaStorageConfig } from "./config";
import { loadMediaStorageConfig } from "./config";
import type { MediaStorageProvider } from "./types";

export function createMediaStorageProvider(
  config: MediaStorageConfig = loadMediaStorageConfig(),
): MediaStorageProvider {
  let provider: MediaStorageProvider;

  switch (config.provider) {
    case "google_drive": {
      if (!config.googleDrive) {
        throw new MediaStorageError("Google Drive media storage is not configured", {
          code: MEDIA_STORAGE_ERROR_CODES.CONFIG,
          providerId: "google_drive",
        });
      }
      provider = new GoogleDriveMediaStorageProvider(config.googleDrive);
      break;
    }
    case "local":
    default:
      provider = new LocalMediaStorageProvider(config.localPath);
  }

  if (config.cache.enabled) {
    provider = new CachingMediaStorageProvider(provider, config.cache);
  }

  return provider;
}
