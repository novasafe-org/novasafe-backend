import { ValidationError } from "@/lib/errors";
import { slugify } from "@/lib/utils";

/** Routes and paths that must not be used as post slugs. */
export const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "admin",
  "blog",
  "editor",
  "posts",
  "media",
  "settings",
  "seo",
  "analytics",
  "team",
  "health",
  "id",
  "upload",
]);

export function normalizeSlug(input: string): string {
  const slug = slugify(input);
  if (!slug) {
    throw new ValidationError("Slug cannot be empty");
  }
  return slug;
}

export function assertSlugAllowed(slug: string): void {
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError(`Slug "${slug}" is reserved`, { reserved: [...RESERVED_SLUGS] });
  }
}

export function slugFromTitle(title: string): string {
  return normalizeSlug(title);
}
