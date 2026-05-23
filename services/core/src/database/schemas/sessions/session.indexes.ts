import type { Model } from 'mongoose';
import type { ISession } from './session.interface';

export const SESSION_INDEX_SPECS = [
  { key: { userId: 1, revoked: 1, lastActivity: -1 } },
  { key: { tokenId: 1 }, unique: true, partialFilterExpression: { revoked: false } },
] as const;

export const applySessionIndexes = async (model: Model<ISession>): Promise<void> => {
  await model.syncIndexes();
};
