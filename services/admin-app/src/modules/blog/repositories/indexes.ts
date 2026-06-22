/**
 * MongoDB index definitions for the blog CMS.
 * Apply once via scripts/mongodb/create-indexes.mongosh.js or Atlas UI.
 */

export type MongoIndexSpec = {
  collection: string;
  name: string;
  key: Record<string, 1 | -1 | "text">;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
};

export const COLLECTIONS = {
  POSTS: "posts",
  CATEGORIES: "categories",
  TAGS: "tags",
  MEDIA: "media",
} as const;

export const MONGODB_INDEXES: MongoIndexSpec[] = [
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_slug_unique",
    key: { slug: 1 },
    unique: true,
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_status_published_at",
    key: { status: 1, published_at: -1 },
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_category_id",
    key: { category_id: 1 },
    sparse: true,
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_tag_ids",
    key: { tag_ids: 1 },
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_author_id",
    key: { "author.id": 1 },
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_created_at",
    key: { created_at: -1 },
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_previous_slugs",
    key: { previous_slugs: 1 },
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_title_text",
    key: { title: "text", excerpt: "text", content_markdown: "text" },
  },
  {
    collection: COLLECTIONS.CATEGORIES,
    name: "categories_slug_unique",
    key: { slug: 1 },
    unique: true,
  },
  {
    collection: COLLECTIONS.CATEGORIES,
    name: "categories_name",
    key: { name: 1 },
  },
  {
    collection: COLLECTIONS.TAGS,
    name: "tags_slug_unique",
    key: { slug: 1 },
    unique: true,
  },
  {
    collection: COLLECTIONS.TAGS,
    name: "tags_name",
    key: { name: 1 },
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_uploaded_at",
    key: { uploaded_at: -1 },
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_mime_type",
    key: { mime_type: 1 },
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_filename",
    key: { filename: 1 },
  },
];
