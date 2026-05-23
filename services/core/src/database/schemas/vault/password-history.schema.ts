import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields } from '../common/encryption.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import type { IPasswordHistory } from './vault.interface';

const passwordHistoryDefinition = {
  ...userIdField,
  credentialId: { type: Schema.Types.ObjectId, required: true, ref: 'VaultItem' },
  ...encryptionFields,
  is_expired: { type: Boolean, default: false },
  ...sourceField,
};

export const PasswordHistorySchema = createBaseSchema(passwordHistoryDefinition);

PasswordHistorySchema.index({ userId: 1, credentialId: 1, is_expired: 1 });
PasswordHistorySchema.index({ credentialId: 1, createdAt: -1 });

export const PASSWORD_HISTORY_MODEL_NAME = 'PasswordHistory';
export const PASSWORD_HISTORY_COLLECTION = COLLECTIONS.passwordVersions;

export type { IPasswordHistory };
