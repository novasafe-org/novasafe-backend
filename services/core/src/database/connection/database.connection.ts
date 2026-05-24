import { EventEmitter } from 'node:events';
import type { Connection } from 'mongoose';
import type { DatabaseConfig } from '../config';
import type { IDatabaseConnection } from '../core/database.interface';
import { ConnectionState, type ConnectionEventName } from '../core/database.types';
import { logger } from '../../shared/logger';
import { toReadableError } from '../../shared/logger/utils/readable-error.util';
import { MongooseConnection } from './mongoose.connection';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Application-level database connection with retries, events, and health checks.
 */
export class DatabaseConnection extends EventEmitter implements IDatabaseConnection {
  private state: ConnectionState = ConnectionState.DISCONNECTED;

  private eventsBound = false;

  private readonly mongoose: MongooseConnection;

  constructor(private readonly config: DatabaseConfig) {
    super();
    this.mongoose = MongooseConnection.getInstance(config);
    this.setMaxListeners(20);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
  }

  getState(): ConnectionState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === ConnectionState.CONNECTED && this.mongoose.readyState === 1;
  }

  getConnection(): Connection {
    return this.mongoose.getConnection();
  }

  on(event: ConnectionEventName, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  off(event: ConnectionEventName, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  private bindConnectionEvents(connection: Connection): void {
    if (this.eventsBound) return;
    this.eventsBound = true;

    connection.on('connected', () => {
      this.setState(ConnectionState.CONNECTED);
      this.emit('connected');
      logger.info('Database event: connected');
    });

    connection.on('disconnected', () => {
      this.setState(ConnectionState.DISCONNECTED);
      this.emit('disconnected');
      logger.warn('Database event: disconnected');
    });

    connection.on('reconnecting', () => {
      this.setState(ConnectionState.RECONNECTING);
      this.emit('reconnecting');
      logger.info('Database event: reconnecting');
    });

    connection.on('reconnected', () => {
      this.setState(ConnectionState.CONNECTED);
      this.emit('connected');
      logger.info('Database event: reconnected');
    });

    connection.on('error', (error: Error) => {
      this.setState(ConnectionState.ERROR);
      this.emit('error', error);
      const readable = toReadableError(error);
      logger.error(`Database event: ${readable.message}`, {
        code: readable.code,
        category: readable.category,
      });
    });
  }

  async connect(): Promise<void> {
    const { attempts, delayMs } = this.config.retry;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= Math.max(1, attempts + 1); attempt += 1) {
      try {
        this.setState(ConnectionState.CONNECTING);
        const connection = await this.mongoose.open();
        this.bindConnectionEvents(connection);
        await connection.db.admin().command({ ping: 1 });
        this.setState(ConnectionState.CONNECTED);
        this.emit('connected');
        logger.info({ attempt, dbName: this.config.dbName }, 'Database connection ready');
        return;
      } catch (error) {
        lastError = error as Error;
        this.setState(ConnectionState.ERROR);
        this.emit('error', lastError);
        logger.warn(
          { attempt, maxAttempts: attempts + 1, err: lastError.message },
          'Database connect attempt failed',
        );
        if (attempt <= attempts) {
          await sleep(delayMs);
        }
      }
    }

    throw lastError ?? new Error('Failed to connect to database');
  }

  async disconnect(): Promise<void> {
    this.setState(ConnectionState.DISCONNECTING);
    await this.mongoose.close();
    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected');
    logger.info('Database disconnected');
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      await this.getConnection().db.admin().command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
