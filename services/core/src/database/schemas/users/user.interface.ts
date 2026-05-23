import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import type { AuthMethod, AuthProvider } from './user.enums';

export interface IVaultUser extends IBaseEntityDocument {
  email: string;
  name?: string;
  passwordHash?: string;
  has_password?: boolean;
  picture?: string;
  avatar_url?: string;
  auth_provider?: AuthProvider | string;
  auth_methods?: AuthMethod[] | string[];
  provider_id?: string;
  googleId?: string;
  appleId?: string;
  email_verified?: boolean;
  novasafeEmailVerified?: boolean | null;
  isFirstOAuthSignup?: boolean;
  twoFactorEnabled?: boolean;
  cloudSyncEnabled?: boolean;
  cloudSyncUpdatedAt?: Date;
  notificationsEnabled?: boolean;
  lastVaultSyncedAt?: Date;
  vaultDataRevision?: number;
  vaultDataRevisionUpdatedAt?: Date;
  deleted?: boolean;
  source?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}
