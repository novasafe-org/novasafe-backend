import type { PostDocument } from "@/types/documents/post";

/** Whether a post may appear on public blog routes. */
export function isPostPubliclyVisible(post: PostDocument, now = new Date()): boolean {
  if (post.status === "draft" || post.status === "archived") return false;

  if (post.status === "published") {
    if (post.published_at && post.published_at > now) return false;
    return true;
  }

  if (post.status === "scheduled") {
    return post.published_at !== null && post.published_at <= now;
  }

  return false;
}
