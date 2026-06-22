import type { ObjectIdString, PostAuthor, PostStatus } from "./common";

export type PostDocument = {
  _id: ObjectIdString;
  title: string;
  slug: string;
  previous_slugs: string[];
  excerpt: string | null;
  content_markdown: string;
  featured_image: string | null;
  status: PostStatus;
  category_id: ObjectIdString | null;
  tag_ids: ObjectIdString[];
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  author: PostAuthor;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePostInput = Omit<PostDocument, "_id" | "created_at" | "updated_at"> & {
  _id?: ObjectIdString;
};

export type UpdatePostInput = Partial<
  Omit<PostDocument, "_id" | "created_at" | "updated_at" | "author">
>;

export type ListPostsFilter = {
  status?: PostStatus;
  category_id?: ObjectIdString;
  tag_id?: ObjectIdString;
  author_id?: string;
  q?: string;
};
