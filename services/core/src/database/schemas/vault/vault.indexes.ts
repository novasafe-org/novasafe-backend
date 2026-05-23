import type { CustomFieldModel, PasswordHistoryModel, VaultItemModel } from './vault.types';

export const VAULT_ITEM_INDEX_SPECS = [
  { key: { userId: 1, category: 1 } },
  { key: { userId: 1, folderId: 1 }, sparse: true },
  { key: { userId: 1, createdAt: -1 } },
  { key: { userId: 1, isFavorite: 1 }, sparse: true },
  { key: { userId: 1, deleted: 1, updatedAt: -1 } },
] as const;

export const PASSWORD_HISTORY_INDEX_SPECS = [
  { key: { userId: 1, credentialId: 1, is_expired: 1 } },
  { key: { credentialId: 1, createdAt: -1 } },
] as const;

export const CUSTOM_FIELD_INDEX_SPECS = [
  { key: { userId: 1, credentialId: 1, deleted: 1 } },
  { key: { credentialId: 1, field_label: 1 } },
] as const;

export const applyVaultIndexes = async (
  vaultItemModel: VaultItemModel,
  passwordHistoryModel: PasswordHistoryModel,
  customFieldModel: CustomFieldModel,
): Promise<void> => {
  await Promise.all([
    vaultItemModel.syncIndexes(),
    passwordHistoryModel.syncIndexes(),
    customFieldModel.syncIndexes(),
  ]);
};
