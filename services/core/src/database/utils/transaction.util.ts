import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';

export type TransactionCallback<T> = (session: ClientSession) => Promise<T>;

/**
 * Runs a callback inside a MongoDB multi-document transaction.
 * Commits on success; aborts on failure.
 */
export const runInTransaction = async <T>(callback: TransactionCallback<T>): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
