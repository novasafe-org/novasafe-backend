import type { VaultUserModel } from './user.types';

export const applyVaultUserIndexes = async (model: VaultUserModel): Promise<void> => {
  await model.syncIndexes();
};

export const VAULT_USER_INDEX_SPECS = [
  { key: { email: 1 }, unique: true, partialFilterExpression: { deleted: false } },
  { key: { googleId: 1 }, sparse: true },
  { key: { appleId: 1 }, sparse: true },
  { key: { provider_id: 1 }, sparse: true },
  { key: { deleted: 1, updatedAt: -1 } },
] as const;
