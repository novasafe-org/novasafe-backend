import { MEDIA_STORAGE_PREFIX } from "@/lib/constants";

export const STORAGE_KEY_LOCAL_PREFIX = "local:";
export const STORAGE_KEY_GOOGLE_DRIVE_PREFIX = "google_drive:";

export function buildLocalStorageKey(mediaId: string, filename: string): string {
  return `${STORAGE_KEY_LOCAL_PREFIX}${MEDIA_STORAGE_PREFIX}${mediaId}/${filename}`;
}

export function buildGoogleDriveStorageKey(fileId: string): string {
  return `${STORAGE_KEY_GOOGLE_DRIVE_PREFIX}${fileId}`;
}

export function isGoogleDriveStorageKey(key: string): boolean {
  return key.startsWith(STORAGE_KEY_GOOGLE_DRIVE_PREFIX);
}

export function isLocalStorageKey(key: string): boolean {
  return key.startsWith(STORAGE_KEY_LOCAL_PREFIX) || key.startsWith(MEDIA_STORAGE_PREFIX);
}

/** Legacy rows used `media/{id}/{file}` without a provider prefix. */
export function normalizeStorageKey(key: string): string {
  if (key.startsWith(STORAGE_KEY_LOCAL_PREFIX) || key.startsWith(STORAGE_KEY_GOOGLE_DRIVE_PREFIX)) {
    return key;
  }
  if (key.startsWith(MEDIA_STORAGE_PREFIX)) {
    return `${STORAGE_KEY_LOCAL_PREFIX}${key}`;
  }
  return key;
}

export function localRelativePath(storageKey: string): string {
  const normalized = normalizeStorageKey(storageKey);
  if (normalized.startsWith(STORAGE_KEY_LOCAL_PREFIX)) {
    return normalized.slice(STORAGE_KEY_LOCAL_PREFIX.length);
  }
  return normalized;
}

export function googleDriveFileId(storageKey: string): string {
  const normalized = normalizeStorageKey(storageKey);
  if (!normalized.startsWith(STORAGE_KEY_GOOGLE_DRIVE_PREFIX)) {
    throw new Error(`Not a Google Drive storage key: ${storageKey}`);
  }
  return normalized.slice(STORAGE_KEY_GOOGLE_DRIVE_PREFIX.length);
}
