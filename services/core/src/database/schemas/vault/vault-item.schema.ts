import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields } from '../common/encryption.schema';
import { sourceField, syncFields } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import { VaultItemCategory } from './vault.enums';
import type { IVaultItem } from './vault.interface';

const vaultItemDefinition = {
  ...userIdField,
  workspaceId: { type: Schema.Types.ObjectId, default: null, sparse: true },
  ...encryptionFields,
  category: { type: String, default: VaultItemCategory.Login },
  title: { type: String, default: null },
  folderId: { type: Schema.Types.ObjectId, default: null, sparse: true },
  tags: { type: [String], default: [] },
  logoUrl: { type: String, default: null },
  isFavorite: { type: Boolean, default: false },
  field_count: { type: Number, default: 0 },
  attachment_count: { type: Number, default: 0 },
  accessCount: { type: Number, default: 0 },
  lastAccessedAt: { type: Date, default: null },
  ...syncFields,
  ...sourceField,
};

export const VaultItemSchema = createBaseSchema(vaultItemDefinition);

VaultItemSchema.index({ userId: 1, category: 1 });
VaultItemSchema.index({ userId: 1, folderId: 1 }, { sparse: true });
VaultItemSchema.index({ userId: 1, createdAt: -1 });
VaultItemSchema.index({ userId: 1, isFavorite: 1 }, { sparse: true });
VaultItemSchema.index({ userId: 1, deleted: 1, updatedAt: -1 });

export const VAULT_ITEM_MODEL_NAME = 'VaultItem';
export const VAULT_ITEM_COLLECTION = COLLECTIONS.vaultItems;

export type { IVaultItem };
