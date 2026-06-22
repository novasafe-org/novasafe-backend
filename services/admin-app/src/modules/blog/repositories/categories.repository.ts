import type { ObjectIdString } from "@/types/documents/common";
import type {
  CategoryDocument,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/types/documents/category";
import { COLLECTIONS } from "@/repositories/indexes";
import type { IMongoClient } from "@/repositories/client/types";
import { MongoDuplicateKeyError, MongoNotFoundError } from "@/repositories/client/errors";
import type { ICategoriesRepository } from "./types";
import { createCategorySchema, updateCategorySchema } from "@/types/schemas/category.schema";
import { newObjectId, serializeDoc } from "./helpers";

export class CategoriesRepository implements ICategoriesRepository {
  constructor(private readonly client: IMongoClient) {}

  async findById(id: string): Promise<CategoryDocument | null> {
    const doc = await this.client.findOne<CategoryDocument>(COLLECTIONS.CATEGORIES, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }

  async findBySlug(slug: string): Promise<CategoryDocument | null> {
    const doc = await this.client.findOne<CategoryDocument>(COLLECTIONS.CATEGORIES, { slug });
    return doc ? serializeDoc(doc) : null;
  }

  async list(): Promise<CategoryDocument[]> {
    const docs = await this.client.findMany<CategoryDocument>(COLLECTIONS.CATEGORIES, {
      sort: { name: 1 },
    });
    return docs.map(serializeDoc);
  }

  async create(input: CreateCategoryInput): Promise<CategoryDocument> {
    const parsed = createCategorySchema.parse(input);
    const document: CategoryDocument = {
      _id: (input._id ?? newObjectId()) as ObjectIdString,
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      description: parsed.description ?? null,
      created_at: new Date(),
    };

    try {
      await this.client.insertOne(COLLECTIONS.CATEGORIES, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }

    return document;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryDocument> {
    const parsed = updateCategorySchema.parse(input);
    const result = await this.client.updateOne(
      COLLECTIONS.CATEGORIES,
      { _id: id },
      { $set: parsed },
    );
    if (result.matchedCount === 0) throw new MongoNotFoundError("Category");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Category");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.client.deleteOne(COLLECTIONS.CATEGORIES, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Category");
  }
}
