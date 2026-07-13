import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { objectIdType } from '../common/schema-types';
import { sharingPermissionField } from '../common/sharing-permission.schema';
import { sourceField } from '../common/source-tracking.schema';
import type { IShareRecord } from './sharing.interface';

const shareRecordDefinition = {
  senderId: { type: objectIdType, required: true, ref: 'VaultUser' },
  senderEmail: { type: String, default: null },
  senderName: { type: String, default: null },
  receiverId: { type: objectIdType, default: null, sparse: true, ref: 'VaultUser' },
  receiverEmail: { type: String, required: true, lowercase: true, trim: true },
  resourceName: { type: String, required: true },
  resourceId: { type: objectIdType, default: null, sparse: true, ref: 'VaultItem' },
  ...sharingPermissionField,
  ...sourceField,
};

export const ShareRecordSchema = createBaseSchema(shareRecordDefinition);

ShareRecordSchema.index({ senderId: 1, createdAt: -1 });
ShareRecordSchema.index({ receiverId: 1, createdAt: -1 });
ShareRecordSchema.index({ receiverEmail: 1, createdAt: -1 });

export const SHARE_RECORD_MODEL_NAME = 'ShareRecord';
export const SHARE_RECORD_COLLECTION = COLLECTIONS.shareRecords;

export type { IShareRecord };
