export { CustomFieldType, PasswordStrength, VaultItemCategory, VaultSyncStatus } from './vault.enums';
export type { ICustomField, IPasswordHistory, IVaultFolder, IVaultItem } from './vault.interface';
export {
  applyVaultIndexes,
  CUSTOM_FIELD_INDEX_SPECS,
  PASSWORD_HISTORY_INDEX_SPECS,
  VAULT_ITEM_INDEX_SPECS,
} from './vault.indexes';
export {
  CUSTOM_FIELD_COLLECTION,
  CUSTOM_FIELD_MODEL_NAME,
  CustomFieldSchema,
} from './custom-field.schema';
export { VAULT_FAVORITE_FIELD, favoriteFilter } from './favorite.schema';
export {
  VAULT_FOLDER_COLLECTION,
  VAULT_FOLDER_MODEL_NAME,
  VaultFolderSchema,
} from './folder.schema';
export {
  PASSWORD_HISTORY_COLLECTION,
  PASSWORD_HISTORY_MODEL_NAME,
  PasswordHistorySchema,
} from './password-history.schema';
export { VAULT_ACTIVE_FILTER, VAULT_TRASH_FILTER } from './trash.schema';
export type {
  CustomFieldDocument,
  CustomFieldModel,
  PasswordHistoryDocument,
  PasswordHistoryModel,
  VaultFolderDocument,
  VaultFolderModel,
  VaultItemDocument,
  VaultItemModel,
} from './vault.types';
export {
  VAULT_ITEM_COLLECTION,
  VAULT_ITEM_MODEL_NAME,
  VaultItemSchema,
} from './vault-item.schema';
