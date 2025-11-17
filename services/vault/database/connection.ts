import { MongoClient, Db } from 'mongodb';
import { DBCONFIG } from '../config/config';
import logger from '../src/logger';

const pools: Record<string, any> = {};

class Database {
  private dbConnection: any;

  constructor(private serviceName: string) {
    this.connect()
  }

  public async connect(): Promise<void> {
    const config = DBCONFIG[this.serviceName];

    if (!config) {
      throw new Error(`Database configuration for service '${this.serviceName}' not found.`);
    }

    if (!config.uri || typeof config.uri !== 'string') {
      throw new Error(`Invalid or missing 'uri' in database configuration for service '${this.serviceName}'.`);
    }

    if (pools[this.serviceName]) {
      this.dbConnection = pools[this.serviceName];
      return;
    }

    if (config.type !== 'mongodb') {
      throw new Error(`Unsupported database type '${config.type}' for service '${this.serviceName}'. Only MongoDB is supported.`);
    }

    logger.debug('Connecting to MongoDB...');

    const clientOptions = {
      // maxPoolSize: 10,
      // serverSelectionTimeoutMS: 30000,
      // socketTimeoutMS: 60000,
      // connectTimeoutMS: 30000,
      retryWrites: true,
      retryReads: true,
      family: 4,
      compressors: ['snappy', 'zlib'] as ('snappy' | 'zlib')[],
    };

    try {
      const client = new MongoClient(config.uri, clientOptions);
      await client.connect();
      await client.db('admin').command({ ping: 1 });

      pools[this.serviceName] = client.db(config.databaseName);
      this.dbConnection = pools[this.serviceName];

      logger.info(`Database connected ✅`);
    } catch (error: any) {
      logger.error(`MongoDB connection failed ❌`);
      throw error; // Re-throw the actual error (e.g. SSL/TLS, timeout, etc.)
    }
  }



  getDb(): Db {
    if (!this.dbConnection) {
      throw new Error('Database connection is not established. Call connect() first.');
    }
    return this.dbConnection;
  }

  async insertOne(collectionName: string, data: any): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).insertOne(data);
  }

  async insertMany(collectionName: string, data: any[]): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).insertMany(data);
  }

  async findOne(collectionName: string, query: any): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).findOne(query);
  }

  async findMany(collectionName: string, query: any): Promise<any[]> {
    const db = this.getDb();
    return db.collection(collectionName).find(query).toArray();
  }

  async updateOne(collectionName: string, filter: any, update: any): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).updateOne(filter, update);
  }

  async updateMany(collectionName: string, filter: any, update: any): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).updateMany(filter, update);
  }

  async deleteOne(collectionName: string, filter: any): Promise<any> {
    const db = this.getDb();
    // just add flag deleted = true
    return db.collection(collectionName).updateOne(filter, { $set: { deleted: true } });
  }

  async deleteMany(collectionName: string, filter: any): Promise<any> {
    const db = this.getDb();
    return db.collection(collectionName).deleteMany(filter);
  }
}

export default Database;