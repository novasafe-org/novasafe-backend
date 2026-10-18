import { loadMediaStorageConfig } from "../media/storage/config";

const DEFAULT_BLOG_IMAGE_EXTENSIONS = ["png", "webp", "jpg", "jpeg"] as const;

export type BlogImagesConfig = {
  folderIds: ReadonlySet<string>;
  allowedFileIds: ReadonlySet<string>;
  credentialsJson: string;
  /** Tried in order when resolving GET /blog-images/by-slug/:slug */
  fileExtensions: readonly string[];
};

function parseExtensions(value: string | undefined): string[] {
  const raw = (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  if (raw.length === 0) return [...DEFAULT_BLOG_IMAGE_EXTENSIONS];
  return raw;
}

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
    fileExtensions: parseExtensions(process.env.BLOG_IMAGE_FILE_EXTENSIONS),
  };
}
