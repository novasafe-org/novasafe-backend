import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { objectIdType } from '../common/schema-types';
import { SharePermission, sharingPermissionField } from '../common/sharing-permission.schema';
import { sourceField } from '../common/source-tracking.schema';
import {
  ShareRecipientStatus,
  ShareResourceType,
  ShareStatus,
} from './sharing.enums';
import type { IShareRecord } from './sharing.interface';

const shareRecipientDefinition = {
  email: { type: String, required: true, lowercase: true, trim: true },
  userId: { type: objectIdType, default: null, sparse: true, ref: 'VaultUser' },
  displayName: { type: String, default: null },
  isNovaSafeUser: { type: Boolean, default: false },
  accessToken: { type: String, default: null },
  status: {
    type: String,
    enum: Object.values(ShareRecipientStatus),
    default: ShareRecipientStatus.Pending,
  },
  invitedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  suspendedAt: { type: Date, default: null },
  lastAccessedAt: { type: Date, default: null },
};

const ShareRecipientSchema = new Schema(shareRecipientDefinition, { _id: true });

const shareRecordDefinition = {
  resourceId: { type: objectIdType, required: true, ref: 'VaultItem' },
  itemName: { type: String, required: true, trim: true },
  resourceType: {
    type: String,
    enum: Object.values(ShareResourceType),
    default: ShareResourceType.VaultItem,
  },
  senderId: { type: objectIdType, required: true, ref: 'VaultUser' },
  senderEmail: { type: String, default: null, lowercase: true, trim: true },
  senderName: { type: String, default: null },
  ...sharingPermissionField,
  recipients: { type: [ShareRecipientSchema], default: [] },
  status: {
    type: String,
    enum: Object.values(ShareStatus),
    default: ShareStatus.Active,
  },
  expiresAt: { type: Date, default: null },
  lastAccessedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  recipientCount: { type: Number, default: 0 },
  activeRecipientCount: { type: Number, default: 0 },
  ...sourceField,
};

export const ShareRecordSchema = createBaseSchema(shareRecordDefinition);

ShareRecordSchema.path('permission').default(SharePermission.Viewer);

ShareRecordSchema.index({ senderId: 1, status: 1, createdAt: -1 });
ShareRecordSchema.index({ resourceId: 1, senderId: 1 });
ShareRecordSchema.index({ 'recipients.userId': 1, status: 1, createdAt: -1 });
ShareRecordSchema.index({ 'recipients.email': 1, status: 1 });
ShareRecordSchema.index({ 'recipients.accessToken': 1 }, { unique: true, sparse: true });
ShareRecordSchema.index({ expiresAt: 1 }, { sparse: true });

export const SHARE_RECORD_MODEL_NAME = 'ShareRecord';
export const SHARE_RECORD_COLLECTION = COLLECTIONS.shareRecords;

export type { IShareRecord };
