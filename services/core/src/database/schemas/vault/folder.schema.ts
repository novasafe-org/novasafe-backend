import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { objectIdType } from '../common/schema-types';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import type { IVaultFolder } from './vault.interface';

/** Placeholder for future folder hierarchy — collection name reserved in COLLECTIONS.folders */
const folderDefinition = {
  ...userIdField,
  name: { type: String, required: true },
  parentId: { type: objectIdType, default: null, index: true, sparse: true },
  ...sourceField,
};

export const VaultFolderSchema = createBaseSchema(folderDefinition);

export const VAULT_FOLDER_MODEL_NAME = 'VaultFolder';
export const VAULT_FOLDER_COLLECTION = COLLECTIONS.folders;

export type { IVaultFolder };
