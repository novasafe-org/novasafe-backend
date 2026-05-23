import type { ClientSession } from 'mongoose';
import { runInTransaction, type TransactionCallback } from '../utils/transaction.util';

/**
 * Central transaction coordinator for multi-step repository operations.
 */
export class TransactionManager {
  private static instance: TransactionManager | null = null;

  static getInstance(): TransactionManager {
    if (!TransactionManager.instance) {
      TransactionManager.instance = new TransactionManager();
    }
    return TransactionManager.instance;
  }

  /**
   * Executes work inside a MongoDB transaction (commit / abort handled automatically).
   */
  async withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
    return runInTransaction(callback);
  }

  /**
   * Pass-through for callers that manage their own session lifecycle.
   */
  async execute<T>(callback: TransactionCallback<T>): Promise<T> {
    return this.withTransaction(callback);
  }

  /** Type-only helper for repository options. */
  withSession<T>(session: ClientSession, callback: (session: ClientSession) => Promise<T>): Promise<T> {
    return callback(session);
  }
}
