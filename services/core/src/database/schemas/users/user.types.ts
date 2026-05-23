import type { HydratedDocument, Model } from 'mongoose';
import type { IVaultUser } from './user.interface';

export type VaultUserDocument = HydratedDocument<IVaultUser>;
export type VaultUserModel = Model<IVaultUser>;
