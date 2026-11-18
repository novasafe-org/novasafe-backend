import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import type { IVaultFolder } from './vault.interface';

/**
 * Flat folders only (one level). `parentId` is not used.
 * Collection name reserved in COLLECTIONS.folders.
 */
const folderDefinition = {
  ...userIdField,
  name: { type: String, required: true, trim: true },
  /** Hex color code for folder tint, e.g. `#E8F0EB`. */
  color: { type: String, default: null, trim: true },
  ...sourceField,
};

export const VaultFolderSchema = createBaseSchema(folderDefinition);

VaultFolderSchema.index({ userId: 1, name: 1 });
VaultFolderSchema.index({ userId: 1, deleted: 1, updatedAt: -1 });

export const VAULT_FOLDER_MODEL_NAME = 'VaultFolder';
export const VAULT_FOLDER_COLLECTION = COLLECTIONS.folders;

export type { IVaultFolder };
