import { loadMediaStorageConfig } from "../media/storage/config";

export type BlogImagesConfig = {
  folderIds: ReadonlySet<string>;
  allowedFileIds: ReadonlySet<string>;
  credentialsJson: string;
};

function parseCsvIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadBlogImagesConfig(): BlogImagesConfig | null {
  const storage = loadMediaStorageConfig();
  if (storage.provider !== "google_drive" || !storage.googleDrive) {
    return null;
  }

  const folderIds = new Set<string>();
  const explicitFolders = parseCsvIds(process.env.BLOG_IMAGES_DRIVE_FOLDER_IDS);
  if (explicitFolders.length > 0) {
    for (const id of explicitFolders) folderIds.add(id);
  } else {
    folderIds.add(storage.googleDrive.folderId);
  }

  const allowedFileIds = new Set(parseCsvIds(process.env.BLOG_IMAGES_ALLOWED_FILE_IDS));

  return {
    folderIds,
    allowedFileIds,
    credentialsJson: storage.googleDrive.credentialsJson,
  };
}
