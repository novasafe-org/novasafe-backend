import type {
  CategoryDocument,
  MediaDocument,
  PostDocument,
  TagDocument,
} from "@/types/documents";

/** ISO-8601 serialized API shapes (JSON-safe). */

export type PostAuthorDto = {
  id: string;
  name: string;
  email?: string;
};

export type PostDto = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content_markdown: string;
  featured_image: string | null;
  status: PostDocument["status"];
  category_id: string | null;
  tag_ids: string[];
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  author: PostAuthorDto;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
};

export type TagDto = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type MediaDto = {
  id: string;
  filename: string;
  original_name: string;
  url: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  uploaded_at: string;
};

export type CreatePostRequest = {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content_markdown?: string;
  featured_image?: string | null;
  status?: PostDocument["status"];
  category_id?: string | null;
  tag_ids?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  author?: PostAuthorDto;
  published_at?: string | null;
};

export type UpdatePostRequest = Partial<CreatePostRequest>;

export type CreateCategoryRequest = {
  name: string;
  slug?: string;
  description?: string | null;
};

export type CreateTagRequest = {
  name: string;
  slug?: string;
};

export type ListPostsQuery = {
  page: number;
  perPage: number;
  status?: PostDocument["status"];
  category_id?: string;
  tag_id?: string;
  author_id?: string;
  q?: string;
};

export function toPostDto(doc: PostDocument): PostDto {
  return {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    content_markdown: doc.content_markdown,
    featured_image: doc.featured_image,
    status: doc.status,
    category_id: doc.category_id,
    tag_ids: doc.tag_ids,
    seo_title: doc.seo_title,
    seo_description: doc.seo_description,
    canonical_url: doc.canonical_url,
    author: doc.author,
    published_at: doc.published_at?.toISOString() ?? null,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

export function toCategoryDto(doc: CategoryDocument): CategoryDto {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    created_at: doc.created_at.toISOString(),
  };
}

export function toTagDto(doc: TagDocument): TagDto {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    created_at: doc.created_at.toISOString(),
  };
}

export function toMediaDto(doc: MediaDocument): MediaDto {
  return {
    id: doc._id,
    filename: doc.filename,
    original_name: doc.original_name,
    url: doc.url,
    mime_type: doc.mime_type,
    size: doc.size,
    width: doc.width ?? null,
    height: doc.height ?? null,
    alt_text: doc.alt_text ?? null,
    uploaded_at: doc.uploaded_at.toISOString(),
  };
}
