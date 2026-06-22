import type { PaginatedResult, PaginationOptions } from "@/types/documents/common";
import type {
  CategoryDocument,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/types/documents/category";
import type {
  CreateMediaInput,
  ListMediaFilter,
  MediaDocument,
  UpdateMediaInput,
} from "@/types/documents/media";
import type {
  CreatePostInput,
  ListPostsFilter,
  PostDocument,
  UpdatePostInput,
} from "@/types/documents/post";
import type { CreateTagInput, TagDocument, UpdateTagInput } from "@/types/documents/tag";

export interface IPostsRepository {
  findById(id: string): Promise<PostDocument | null>;
  findBySlug(slug: string): Promise<PostDocument | null>;
  findBySlugOrPrevious(slug: string): Promise<PostDocument | null>;
  countMediaReferences(mediaId: string, publicUrl: string): Promise<number>;
  resolveUniqueSlug(desired: string, excludeId?: string): Promise<string>;
  list(filter: ListPostsFilter, pagination: PaginationOptions): Promise<PaginatedResult<PostDocument>>;
  listPublished(filter: ListPostsFilter, pagination: PaginationOptions): Promise<PaginatedResult<PostDocument>>;
  create(input: CreatePostInput): Promise<PostDocument>;
  update(id: string, input: UpdatePostInput): Promise<PostDocument>;
  delete(id: string): Promise<void>;
  isPubliclyVisible(post: PostDocument): boolean;
}

export interface ICategoriesRepository {
  findById(id: string): Promise<CategoryDocument | null>;
  findBySlug(slug: string): Promise<CategoryDocument | null>;
  list(): Promise<CategoryDocument[]>;
  create(input: CreateCategoryInput): Promise<CategoryDocument>;
  update(id: string, input: UpdateCategoryInput): Promise<CategoryDocument>;
  delete(id: string): Promise<void>;
}

export interface ITagsRepository {
  findById(id: string): Promise<TagDocument | null>;
  findBySlug(slug: string): Promise<TagDocument | null>;
  list(): Promise<TagDocument[]>;
  create(input: CreateTagInput): Promise<TagDocument>;
  update(id: string, input: UpdateTagInput): Promise<TagDocument>;
  delete(id: string): Promise<void>;
}

export interface IMediaRepository {
  findById(id: string): Promise<MediaDocument | null>;
  list(filter: ListMediaFilter, pagination: PaginationOptions): Promise<PaginatedResult<MediaDocument>>;
  create(input: CreateMediaInput): Promise<MediaDocument>;
  update(id: string, input: UpdateMediaInput): Promise<MediaDocument>;
  delete(id: string): Promise<void>;
}

export type MongoRepositories = {
  posts: IPostsRepository;
  categories: ICategoriesRepository;
  tags: ITagsRepository;
  media: IMediaRepository;
};
