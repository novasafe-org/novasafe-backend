import mongoose from 'mongoose';

/**
 * Native Mongo driver access (same collections as mobile_vault) via the active Mongoose connection.
 */
export class NativeMongoAdapter {
  getDb() {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB is not connected. Initialize ConnectionManager first.');
    }
    return db;
  }

  collection(name: string) {
    return this.getDb().collection(name);
  }

  async insertOne(collectionName: string, data: Record<string, unknown>) {
    return this.collection(collectionName).insertOne(data);
  }

  async findOne(collectionName: string, query: Record<string, unknown>) {
    return this.collection(collectionName).findOne(query);
  }

  async findMany(
    collectionName: string,
    query: Record<string, unknown>,
    options?: { skip?: number; limit?: number; sort?: Record<string, 1 | -1> },
  ) {
    let cursor = this.collection(collectionName).find(query);
    if (options?.sort) cursor = cursor.sort(options.sort);
    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);
    return cursor.toArray();
  }

  async updateOne(
    collectionName: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) {
    return this.collection(collectionName).updateOne(filter, update);
  }
}

let adapter: NativeMongoAdapter | null = null;

export const getNativeMongo = (): NativeMongoAdapter => {
  if (!adapter) adapter = new NativeMongoAdapter();
  return adapter;
};
