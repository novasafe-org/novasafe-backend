import { z } from "zod";
import {
  objectIdSchema,
  postAuthorSchema,
  postStatusSchema,
  slugSchema,
  urlSchema,
  paginationSchema,
} from "@/types/schemas/common.schema";

/** n8n and other clients often send "" for omitted optional fields. */
function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === null) return undefined;
  return value;
}

/** Route param: MongoDB ObjectId */
export const mongoIdParamSchema = z.object({
  id: objectIdSchema,
});

export const slugParamSchema = z.object({
  slug: slugSchema,
});

/** POST /posts — author optional (filled from JWT admin) */
export const createPostBodySchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  excerpt: z.string().max(500).nullable().optional(),
  content_markdown: z.string().max(500_000).default(""),
  featured_image: z.string().max(2048).nullable().optional(),
  status: postStatusSchema.default("draft"),
  category_id: z.preprocess(emptyToUndefined, objectIdSchema.nullable().optional()),
  tag_ids: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.array(objectIdSchema).max(50).default([]),
  ),
  seo_title: z.string().max(70).nullable().optional(),
  seo_description: z.string().max(160).nullable().optional(),
  canonical_url: z.preprocess(emptyToUndefined, urlSchema.nullable().optional()),
  author: postAuthorSchema.optional(),
  published_at: z.preprocess(
    emptyToUndefined,
    z.string().datetime().nullable().optional(),
  ),
});

export const updatePostBodySchema = createPostBodySchema.partial();

export const listPostsQuerySchema = paginationSchema
  .extend({
    status: postStatusSchema.optional(),
    category_id: objectIdSchema.optional(),
    category: objectIdSchema.optional(),
    tag_id: objectIdSchema.optional(),
    author_id: z.string().max(128).optional(),
    q: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((data) => ({
    page: data.page,
    perPage: data.limit ?? data.perPage,
    status: data.status,
    category_id: data.category_id ?? data.category,
    tag_id: data.tag_id,
    author_id: data.author_id,
    q: data.q,
  }));

export const createCategoryBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(500).nullable().optional(),
});

export const createTagBodySchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema.optional(),
});

export type CreatePostBody = z.infer<typeof createPostBodySchema>;
export type UpdatePostBody = z.infer<typeof updatePostBodySchema>;
export type ListPostsQueryInput = z.infer<typeof listPostsQuerySchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type CreateTagBody = z.infer<typeof createTagBodySchema>;
