import { z } from "zod";
import {
  isoDateSchema,
  objectIdSchema,
  paginationSchema,
  postAuthorSchema,
  postStatusSchema,
  slugSchema,
  urlSchema,
} from "./common.schema";

export const createPostSchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  previous_slugs: z.array(slugSchema).max(50).default([]),
  excerpt: z.string().max(500).nullable().optional(),
  content_markdown: z.string().max(500_000).default(""),
  featured_image: z.string().max(2048).nullable().optional(),
  status: postStatusSchema.default("draft"),
  category_id: objectIdSchema.nullable().optional(),
  tag_ids: z.array(objectIdSchema).max(50).default([]),
  seo_title: z.string().max(70).nullable().optional(),
  seo_description: z.string().max(160).nullable().optional(),
  canonical_url: urlSchema.nullable().optional(),
  author: postAuthorSchema,
  published_at: isoDateSchema.nullable().optional(),
});

export const updatePostSchema = createPostSchema.partial();

export const listPostsFilterSchema = paginationSchema.extend({
  status: postStatusSchema.optional(),
  category_id: objectIdSchema.optional(),
  tag_id: objectIdSchema.optional(),
  author_id: z.string().max(128).optional(),
  q: z.string().max(200).optional(),
});

export const postDocumentSchema = createPostSchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export type CreatePostSchema = z.infer<typeof createPostSchema>;
export type UpdatePostSchema = z.infer<typeof updatePostSchema>;
export type ListPostsFilterSchema = z.infer<typeof listPostsFilterSchema>;
export type PostDocumentSchema = z.infer<typeof postDocumentSchema>;
