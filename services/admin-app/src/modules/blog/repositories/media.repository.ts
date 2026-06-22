import type { PaginatedResult, PaginationOptions } from "@/types/documents/common";
import type { ObjectIdString } from "@/types/documents/common";
import type {
  CreateMediaInput,
  ListMediaFilter,
  MediaDocument,
  UpdateMediaInput,
} from "@/types/documents/media";
import { COLLECTIONS } from "@/repositories/indexes";
import type { IMongoClient } from "@/repositories/client/types";
import { MongoNotFoundError } from "@/repositories/client/errors";
import type { IMediaRepository } from "./types";
import { createMediaSchema, updateMediaSchema } from "@/types/schemas/media.schema";
import { newObjectId, serializeDoc, toPaginated } from "./helpers";

export class MediaRepository implements IMediaRepository {
  constructor(private readonly client: IMongoClient) {}

  async findById(id: string): Promise<MediaDocument | null> {
    const doc = await this.client.findOne<MediaDocument>(COLLECTIONS.MEDIA, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }

  async list(
    filter: ListMediaFilter,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<MediaDocument>> {
    const mongoFilter: Record<string, unknown> = {};
    if (filter.mime_type) mongoFilter.mime_type = filter.mime_type;

    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany<MediaDocument>(COLLECTIONS.MEDIA, {
        filter: mongoFilter,
        sort: { uploaded_at: -1 },
        skip,
        limit: pagination.perPage,
      }),
      this.client.countDocuments(COLLECTIONS.MEDIA, mongoFilter),
    ]);

    return toPaginated(items.map(serializeDoc), total, pagination);
  }

  async create(input: CreateMediaInput): Promise<MediaDocument> {
    const parsed = createMediaSchema.parse(input);
    const document: MediaDocument = {
      _id: (input._id ?? newObjectId()) as ObjectIdString,
      filename: parsed.filename,
      original_name: parsed.original_name,
      r2_key: parsed.r2_key,
      url: parsed.url,
      mime_type: parsed.mime_type,
      size: parsed.size,
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      alt_text: parsed.alt_text ?? null,
      uploaded_by: parsed.uploaded_by,
      uploaded_at: input.uploaded_at ?? new Date(),
    };

    await this.client.insertOne(COLLECTIONS.MEDIA, document);
    return document;
  }

  async update(id: string, input: UpdateMediaInput): Promise<MediaDocument> {
    const parsed = updateMediaSchema.parse(input);
    const result = await this.client.updateOne(COLLECTIONS.MEDIA, { _id: id }, { $set: parsed });
    if (result.matchedCount === 0) throw new MongoNotFoundError("Media");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Media");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.client.deleteOne(COLLECTIONS.MEDIA, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Media");
  }
}
