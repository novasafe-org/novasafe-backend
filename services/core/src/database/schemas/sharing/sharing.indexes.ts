import type { Model } from 'mongoose';
import type { IShareRecord } from './sharing.interface';

export const SHARING_INDEX_SPECS = [
  { key: { senderId: 1, status: 1, createdAt: -1 } },
  { key: { resourceId: 1, senderId: 1 } },
  { key: { 'recipients.userId': 1, status: 1, createdAt: -1 } },
  { key: { 'recipients.email': 1, status: 1 } },
  { key: { 'recipients.accessToken': 1 }, unique: true, sparse: true },
  { key: { expiresAt: 1 }, sparse: true },
] as const;

export const applySharingIndexes = async (model: Model<IShareRecord>): Promise<void> => {
  await model.syncIndexes();
};
