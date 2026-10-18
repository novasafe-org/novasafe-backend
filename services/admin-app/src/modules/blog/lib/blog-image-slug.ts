/** Same pattern as static blog slugs in novasafe-landing-v2. */
export const BLOG_IMAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseBlogImageSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!BLOG_IMAGE_SLUG_PATTERN.test(slug)) {
    throw new Error("Invalid blog image slug");
  }
  return slug;
}

export function blogImageFilename(slug: string, extension: string): string {
  const ext = extension.replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) {
    throw new Error("Invalid blog image extension");
  }
  return `${parseBlogImageSlug(slug)}.${ext}`;
}
