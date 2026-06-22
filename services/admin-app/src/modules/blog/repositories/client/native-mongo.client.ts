import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import type {
  DeleteOneResult,
  FindOptions,
  IMongoClient,
  InsertOneResult,
  MongoFilter,
  UpdateOneResult,
} from "./types";
import { MongoClientError, MongoDuplicateKeyError } from "./errors";

export class NativeMongoClient implements IMongoClient {
  constructor(private readonly db: Db) {}

  private collection(name: string) {
    return this.db.collection(name);
  }

  async findOne<T>(
    collection: string,
    filter: MongoFilter,
    projection?: Record<string, 0 | 1>,
  ): Promise<T | null> {
    try {
      const doc = await this.collection(collection).findOne(filter, {
        ...(projection ? { projection } : {}),
      });
      return (doc as T | null) ?? null;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async findMany<T>(collection: string, options: FindOptions = {}): Promise<T[]> {
    try {
      let cursor = this.collection(collection).find(options.filter ?? {});

      if (options.projection) {
        cursor = cursor.project(options.projection);
      }
      if (options.sort) {
        cursor = cursor.sort(options.sort);
      }
      if (options.skip !== undefined) {
        cursor = cursor.skip(options.skip);
      }
      if (options.limit !== undefined) {
        cursor = cursor.limit(options.limit);
      }

      const docs = await cursor.toArray();
      return docs as T[];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async insertOne<T extends Record<string, unknown>>(
    collection: string,
    document: T,
  ): Promise<InsertOneResult> {
    try {
      const result = await this.collection(collection).insertOne(document);
      const insertedId = result.insertedId;
      return {
        insertedId:
          typeof insertedId === "string"
            ? insertedId
            : insertedId?.toString?.() ?? String(insertedId),
      };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new MongoDuplicateKeyError("unique index");
      }
      throw this.wrapError(error);
    }
  }

  async updateOne(
    collection: string,
    filter: MongoFilter,
    update: Record<string, unknown>,
  ): Promise<UpdateOneResult> {
    try {
      const result = await this.collection(collection).updateOne(filter, update);
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async deleteOne(collection: string, filter: MongoFilter): Promise<DeleteOneResult> {
    try {
      const result = await this.collection(collection).deleteOne(filter);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async countDocuments(collection: string, filter: MongoFilter = {}): Promise<number> {
    try {
      return await this.collection(collection).countDocuments(filter);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private wrapError(error: unknown): MongoClientError {
    if (error instanceof MongoClientError) return error;
    if (error instanceof Error) {
      return new MongoClientError(error.message);
    }
    return new MongoClientError("MongoDB operation failed");
  }
}

export function createNativeMongoClient(db: Db): NativeMongoClient {
  return new NativeMongoClient(db);
}
