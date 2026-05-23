import type { Model } from 'mongoose';
import type { IShareRecord } from './sharing.interface';

export const SHARING_INDEX_SPECS = [
  { key: { senderId: 1, createdAt: -1 } },
  { key: { receiverId: 1, createdAt: -1 } },
  { key: { receiverEmail: 1, createdAt: -1 } },
] as const;

export const applySharingIndexes = async (model: Model<IShareRecord>): Promise<void> => {
  await model.syncIndexes();
};
