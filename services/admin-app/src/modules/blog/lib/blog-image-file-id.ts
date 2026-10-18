/** Google Drive file ids are URL-safe alphanumeric strings (length varies). */
export const BLOG_IMAGE_FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,128}$/;

export function parseBlogImageFileId(raw: string): string {
  const fileId = raw.trim();
  if (!BLOG_IMAGE_FILE_ID_PATTERN.test(fileId)) {
    throw new Error("Invalid blog image file id");
  }
  return fileId;
}

export function isBlogImageFileId(raw: string): boolean {
  return BLOG_IMAGE_FILE_ID_PATTERN.test(raw.trim());
}
