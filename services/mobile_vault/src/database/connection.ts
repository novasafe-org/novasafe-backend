import { Db, MongoClient } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';

const pools: Record<string, Db> = {};

class Database {
  private dbConnection: Db | null = null;

  constructor(private serviceName: string) {
    this.connect();
  }

  public async connect(): Promise<void> {
    if (pools[this.serviceName]) {
      this.dbConnection = pools[this.serviceName];
      return;
    }

    const client = new MongoClient(DB_CONFIG.uri, { retryReads: true, retryWrites: true, family: 4 });
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    pools[this.serviceName] = client.db(DB_CONFIG.databaseName);
    this.dbConnection = pools[this.serviceName];
  }

  getDb(): Db {
    if (!this.dbConnection) throw new Error('Database connection is not established');
    return this.dbConnection;
  }

  async insertOne(collectionName: string, data: any) {
    return this.getDb().collection(collectionName).insertOne(data);
  }

  async findOne(collectionName: string, query: any) {
    return this.getDb().collection(collectionName).findOne(query);
  }

  async findMany(collectionName: string, query: any, options?: { skip?: number; limit?: number; sort?: any }) {
    let cursor = this.getDb().collection(collectionName).find(query);
    if (options?.sort) cursor = cursor.sort(options.sort);
    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);
    return cursor.toArray();
  }

  async updateOne(collectionName: string, filter: any, update: any) {
    return this.getDb().collection(collectionName).updateOne(filter, update);
  }
}

export default Database;
