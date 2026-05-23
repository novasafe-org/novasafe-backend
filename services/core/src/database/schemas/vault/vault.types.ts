import type { HydratedDocument, Model } from 'mongoose';
import type { ICustomField, IPasswordHistory, IVaultFolder, IVaultItem } from './vault.interface';

export type VaultItemDocument = HydratedDocument<IVaultItem>;
export type VaultItemModel = Model<IVaultItem>;
export type PasswordHistoryDocument = HydratedDocument<IPasswordHistory>;
export type PasswordHistoryModel = Model<IPasswordHistory>;
export type CustomFieldDocument = HydratedDocument<ICustomField>;
export type CustomFieldModel = Model<ICustomField>;
export type VaultFolderDocument = HydratedDocument<IVaultFolder>;
export type VaultFolderModel = Model<IVaultFolder>;
