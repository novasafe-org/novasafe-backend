import mongoose, { type Connection, type ConnectOptions } from 'mongoose';
import type { DatabaseConfig } from '../config';
import { logger } from '../../shared/logger';

/**
 * Low-level Mongoose driver wrapper (singleton).
 */
export class MongooseConnection {
  private static instance: MongooseConnection | null = null;

  private connection: Connection | null = null;

  private constructor(private readonly config: DatabaseConfig) {}

  static getInstance(config: DatabaseConfig): MongooseConnection {
    if (!MongooseConnection.instance) {
      MongooseConnection.instance = new MongooseConnection(config);
    }
    return MongooseConnection.instance;
  }

  static resetInstance(): void {
    MongooseConnection.instance = null;
  }

  getConnectOptions(): ConnectOptions {
    const { connection, dbName } = this.config;
    return {
      dbName,
      maxPoolSize: connection.maxPoolSize,
      serverSelectionTimeoutMS: connection.serverSelectionTimeoutMS,
      socketTimeoutMS: connection.socketTimeoutMS,
      retryReads: connection.retryReads,
      retryWrites: connection.retryWrites,
      family: connection.family,
    };
  }

  async open(): Promise<Connection> {
    if (this.connection?.readyState === 1) {
      return this.connection;
    }

    mongoose.set('strictQuery', true);

    await mongoose.connect(this.config.uri, this.getConnectOptions());
    this.connection = mongoose.connection;

    logger.info(
      { dbName: this.config.dbName, host: this.connection.host },
      'Mongoose connection established',
    );

    return this.connection;
  }

  async close(): Promise<void> {
    if (!this.connection) {
      return;
    }
    await mongoose.disconnect();
    this.connection = null;
    logger.info('Mongoose connection closed');
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Mongoose connection is not established. Call open() first.');
    }
    return this.connection;
  }

  get readyState(): number {
    return this.connection?.readyState ?? 0;
  }
}
