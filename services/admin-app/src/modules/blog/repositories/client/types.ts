/** MongoDB connection settings (official driver). */
export type MongoConfig = {
  uri: string;
  databaseName: string;
};

export type MongoFilter = Record<string, unknown>;

export type MongoSort = Record<string, 1 | -1>;

export type FindOptions = {
  filter?: MongoFilter;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
};

export type InsertOneResult = {
  insertedId: string;
};

export type UpdateOneResult = {
  matchedCount: number;
  modifiedCount: number;
};

export type DeleteOneResult = {
  deletedCount: number;
};

export type CountResult = {
  count: number;
};

/**
 * Transport-agnostic client contract used by repositories.
 * Implemented by NativeMongoClient (official mongodb driver).
 */
export interface IMongoClient {
  findOne<T>(collection: string, filter: MongoFilter, projection?: Record<string, 0 | 1>): Promise<T | null>;
  findMany<T>(collection: string, options?: FindOptions): Promise<T[]>;
  insertOne<T extends Record<string, unknown>>(collection: string, document: T): Promise<InsertOneResult>;
  updateOne(
    collection: string,
    filter: MongoFilter,
    update: Record<string, unknown>,
  ): Promise<UpdateOneResult>;
  deleteOne(collection: string, filter: MongoFilter): Promise<DeleteOneResult>;
  countDocuments(collection: string, filter?: MongoFilter): Promise<number>;
}
