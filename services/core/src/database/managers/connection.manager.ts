import {
  databaseConfig,
  loadDatabaseConfig,
  validateDatabaseConfig,
  type DatabaseConfig,
} from '../config';
import { DatabaseConnection } from '../connection';
import type { IConnectionManager, ConnectionManagerStatus } from '../core/database.interface';
import { ConnectionState } from '../core/database.types';
import { ModelRegistry } from '../models/model.registry';
import { ensureAllSchemaIndexes } from '../schemas/ensure-indexes';
import { logger } from '../../shared/logger';

/**
 * Orchestrates database lifecycle for the core service (initialize / shutdown / status).
 */
export class ConnectionManager implements IConnectionManager {
  private static instance: ConnectionManager | null = null;

  private databaseConnection: DatabaseConnection | null = null;

  private config: DatabaseConfig = databaseConfig;

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  static resetInstance(): void {
    ConnectionManager.instance = null;
  }

  getDatabaseConnection(): DatabaseConnection {
    if (!this.databaseConnection) {
      throw new Error('ConnectionManager is not initialized. Call initialize() first.');
    }
    return this.databaseConnection;
  }

  async initialize(config: DatabaseConfig = loadDatabaseConfig()): Promise<void> {
    this.config = config;

    const validation = validateDatabaseConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid database configuration: ${validation.errors.join('; ')}`);
    }

    logger.info(
      {
        dbName: config.dbName,
        environment: config.environment,
        poolSize: config.connection.maxPoolSize,
      },
      'Initializing database connection',
    );

    this.databaseConnection = new DatabaseConnection(config);
    await this.databaseConnection.connect();

    const pingOk = await this.databaseConnection.ping();
    ModelRegistry.registerAll();
    await ensureAllSchemaIndexes();
    try {
      const { ensureSubscriptionIndexes } = await import(
        '../../modules/subscriptions/services/subscription.service'
      );
      await ensureSubscriptionIndexes();
    } catch (error) {
      logger.warn('Subscription index setup skipped or failed', {
        err: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      const { ensureStatusPageReady } = await import('../../modules/status-page');
      await ensureStatusPageReady();
    } catch (error) {
      logger.warn('Status page bootstrap skipped or failed', {
        err: error instanceof Error ? error.message : String(error),
      });
    }
    logger.info(
      { ping: pingOk, state: this.databaseConnection.getState(), models: ModelRegistry.listModelNames() },
      'Database health check',
    );
  }

  async shutdown(): Promise<void> {
    if (!this.databaseConnection) {
      return;
    }
    logger.info('Shutting down database connection');
    await this.databaseConnection.disconnect();
    this.databaseConnection = null;
    logger.info('Database shutdown complete');
  }

  getStatus(): ConnectionManagerStatus {
    const connection = this.databaseConnection;
    const state = connection?.getState() ?? ConnectionState.DISCONNECTED;
    const ready = connection?.isReady() ?? false;
    let host: string | undefined;

    try {
      host = connection?.getConnection().host;
    } catch {
      host = undefined;
    }

    return {
      state,
      ready,
      dbName: this.config.dbName,
      host,
    };
  }

  async ping(): Promise<boolean> {
    return this.databaseConnection?.ping() ?? false;
  }
}
