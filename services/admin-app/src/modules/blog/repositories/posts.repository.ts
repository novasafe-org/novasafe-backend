import type { PaginatedResult, PaginationOptions } from "@/types/documents/common";
import type { ObjectIdString } from "@/types/documents/common";
import type {
  CreatePostInput,
  ListPostsFilter,
  PostDocument,
  UpdatePostInput,
} from "@/types/documents/post";
import { COLLECTIONS } from "@/repositories/indexes";
import type { IMongoClient } from "@/repositories/client/types";
import { MongoDuplicateKeyError, MongoNotFoundError } from "@/repositories/client/errors";
import type { IPostsRepository } from "./types";
import { createPostSchema, updatePostSchema } from "@/types/schemas/post.schema";
import { newObjectId, serializeDoc, toPaginated, withTimestamps } from "./helpers";
import { assertSlugAllowed, normalizeSlug, slugFromTitle } from "@/lib/slug";
import { isPostPubliclyVisible } from "@/lib/post-visibility";

export class PostsRepository implements IPostsRepository {
  constructor(private readonly client: IMongoClient) {}

  async findById(id: string): Promise<PostDocument | null> {
    const doc = await this.client.findOne<PostDocument>(COLLECTIONS.POSTS, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }

  async findBySlug(slug: string): Promise<PostDocument | null> {
    const doc = await this.client.findOne<PostDocument>(COLLECTIONS.POSTS, { slug });
    return doc ? serializeDoc(doc) : null;
  }

  async findBySlugOrPrevious(slug: string): Promise<PostDocument | null> {
    const direct = await this.findBySlug(slug);
    if (direct) return direct;

    const doc = await this.client.findOne<PostDocument>(COLLECTIONS.POSTS, {
      previous_slugs: slug,
    });
    return doc ? serializeDoc(doc) : null;
  }

  async countMediaReferences(mediaId: string, publicUrl: string): Promise<number> {
    const needle = `/media/${mediaId}`;
    const filter = {
      $or: [
        { featured_image: { $regex: needle } },
        { featured_image: publicUrl },
        { content_markdown: { $regex: needle } },
        { content_markdown: { $regex: publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } },
      ],
    };
    return this.client.countDocuments(COLLECTIONS.POSTS, filter);
  }

  async list(
    filter: ListPostsFilter,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<PostDocument>> {
    return this.query(filter, pagination);
  }

  async listPublished(
    filter: ListPostsFilter,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<PostDocument>> {
    const now = new Date();
    const mongoFilter: Record<string, unknown> = {
      $or: [
        { status: "published", $or: [{ published_at: null }, { published_at: { $lte: now } }] },
        { status: "scheduled", published_at: { $lte: now } },
      ],
    };

    if (filter.category_id) mongoFilter.category_id = filter.category_id;
    if (filter.tag_id) mongoFilter.tag_ids = filter.tag_id;
    if (filter.author_id) mongoFilter["author.id"] = filter.author_id;
    if (filter.q) mongoFilter.$text = { $search: filter.q };

    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany<PostDocument>(COLLECTIONS.POSTS, {
        filter: mongoFilter,
        sort: { published_at: -1, created_at: -1 },
        skip,
        limit: pagination.perPage,
      }),
      this.client.countDocuments(COLLECTIONS.POSTS, mongoFilter),
    ]);

    return toPaginated(items.map(serializeDoc), total, pagination);
  }

  private async query(
    filter: ListPostsFilter,
    pagination: PaginationOptions,
    extraFilter: Record<string, unknown> = {},
  ): Promise<PaginatedResult<PostDocument>> {
    const mongoFilter: Record<string, unknown> = { ...extraFilter };

    if (filter.status) mongoFilter.status = filter.status;
    if (filter.category_id) mongoFilter.category_id = filter.category_id;
    if (filter.tag_id) mongoFilter.tag_ids = filter.tag_id;
    if (filter.author_id) mongoFilter["author.id"] = filter.author_id;
    if (filter.q) mongoFilter.$text = { $search: filter.q };

    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany<PostDocument>(COLLECTIONS.POSTS, {
        filter: mongoFilter,
        sort: { created_at: -1 },
        skip,
        limit: pagination.perPage,
      }),
      this.client.countDocuments(COLLECTIONS.POSTS, mongoFilter),
    ]);

    return toPaginated(items.map(serializeDoc), total, pagination);
  }

  private async slugTaken(slug: string, excludeId?: string): Promise<boolean> {
    const existing = await this.findBySlug(slug);
    if (existing && existing._id !== excludeId) return true;

    const redirected = await this.client.findOne<PostDocument>(COLLECTIONS.POSTS, {
      previous_slugs: slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    return Boolean(redirected);
  }

  async resolveUniqueSlug(desired: string, excludeId?: string): Promise<string> {
    const base = normalizeSlug(desired);
    assertSlugAllowed(base);

    let candidate = base;
    let counter = 2;

    while (await this.slugTaken(candidate, excludeId)) {
      candidate = `${base}-${counter}`;
      assertSlugAllowed(candidate);
      counter += 1;
    }

    return candidate;
  }

  async create(input: CreatePostInput): Promise<PostDocument> {
    const parsed = createPostSchema.parse(input);
    const now = new Date();
    const _id = (input._id ?? newObjectId()) as ObjectIdString;

    const baseSlug = parsed.slug ? normalizeSlug(parsed.slug) : slugFromTitle(parsed.title);
    const slug = await this.resolveUniqueSlug(baseSlug);

    const document = {
      ...parsed,
      _id,
      slug,
      title: parsed.title,
      previous_slugs: parsed.previous_slugs ?? [],
      excerpt: parsed.excerpt ?? null,
      featured_image: parsed.featured_image ?? null,
      category_id: (parsed.category_id as ObjectIdString | null | undefined) ?? null,
      tag_ids: (parsed.tag_ids as ObjectIdString[]) ?? [],
      seo_title: parsed.seo_title ?? null,
      seo_description: parsed.seo_description ?? null,
      canonical_url: parsed.canonical_url ?? null,
      published_at: parsed.published_at ?? null,
      view_count: parsed.view_count ?? 0,
      unique_view_count: parsed.unique_view_count ?? 0,
      created_at: now,
      updated_at: now,
    } as PostDocument;

    try {
      await this.client.insertOne(COLLECTIONS.POSTS, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }

    return document;
  }

  async update(id: string, input: UpdatePostInput): Promise<PostDocument> {
    const parsed = updatePostSchema.parse(input);
    const existing = await this.findById(id);
    if (!existing) throw new MongoNotFoundError("Post");

    const patch = { ...parsed } as UpdatePostInput;

    if (parsed.slug !== undefined && parsed.slug !== existing.slug) {
      const nextSlug = await this.resolveUniqueSlug(parsed.slug, id);
      patch.slug = nextSlug;
      const previous = [...(existing.previous_slugs ?? [])];
      if (!previous.includes(existing.slug)) {
        previous.push(existing.slug);
      }
      patch.previous_slugs = previous;
    }

    const result = await this.client.updateOne(
      COLLECTIONS.POSTS,
      { _id: id },
      { $set: withTimestamps(patch) },
    );

    if (result.matchedCount === 0) throw new MongoNotFoundError("Post");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Post");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.client.deleteOne(COLLECTIONS.POSTS, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Post");
  }

  isPubliclyVisible(post: PostDocument): boolean {
    return isPostPubliclyVisible(post);
  }

  async recordView(
    postId: string,
    visitorKey: string,
  ): Promise<{ view_count: number; unique_view_count: number }> {
    const key = visitorKey.trim().slice(0, 128) || "anonymous";

    await this.client.updateOne(
      COLLECTIONS.POSTS,
      { _id: postId },
      { $inc: { view_count: 1 } },
    );

    let isNewVisitor = false;
    try {
      await this.client.insertOne(COLLECTIONS.POST_VIEWS, {
        post_id: postId,
        visitor_key: key,
        created_at: new Date(),
      });
      isNewVisitor = true;
    } catch (error) {
      if (!(error instanceof MongoDuplicateKeyError)) {
        throw error;
      }
    }

    if (isNewVisitor) {
      await this.client.updateOne(
        COLLECTIONS.POSTS,
        { _id: postId },
        { $inc: { unique_view_count: 1 } },
      );
    }

    const post = await this.findById(postId);
    return {
      view_count: post?.view_count ?? 0,
      unique_view_count: post?.unique_view_count ?? 0,
    };
  }
}
