import type { ObjectIdString } from "@/types/documents/common";
import type { CreateTagInput, TagDocument, UpdateTagInput } from "@/types/documents/tag";
import { COLLECTIONS } from "@/repositories/indexes";
import type { IMongoClient } from "@/repositories/client/types";
import { MongoDuplicateKeyError, MongoNotFoundError } from "@/repositories/client/errors";
import type { ITagsRepository } from "./types";
import { createTagSchema, updateTagSchema } from "@/types/schemas/tag.schema";
import { newObjectId, serializeDoc } from "./helpers";

export class TagsRepository implements ITagsRepository {
  constructor(private readonly client: IMongoClient) {}

  async findById(id: string): Promise<TagDocument | null> {
    const doc = await this.client.findOne<TagDocument>(COLLECTIONS.TAGS, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }

  async findBySlug(slug: string): Promise<TagDocument | null> {
    const doc = await this.client.findOne<TagDocument>(COLLECTIONS.TAGS, { slug });
    return doc ? serializeDoc(doc) : null;
  }

  async list(): Promise<TagDocument[]> {
    const docs = await this.client.findMany<TagDocument>(COLLECTIONS.TAGS, {
      sort: { name: 1 },
    });
    return docs.map(serializeDoc);
  }

  async create(input: CreateTagInput): Promise<TagDocument> {
    const parsed = createTagSchema.parse(input);
    const document: TagDocument = {
      _id: (input._id ?? newObjectId()) as ObjectIdString,
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      created_at: new Date(),
    };

    try {
      await this.client.insertOne(COLLECTIONS.TAGS, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }

    return document;
  }

  async update(id: string, input: UpdateTagInput): Promise<TagDocument> {
    const parsed = updateTagSchema.parse(input);
    const result = await this.client.updateOne(COLLECTIONS.TAGS, { _id: id }, { $set: parsed });
    if (result.matchedCount === 0) throw new MongoNotFoundError("Tag");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Tag");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.client.deleteOne(COLLECTIONS.TAGS, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Tag");
  }
}
