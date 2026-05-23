import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { partialIndexActiveUser } from '../common/indexes.util';
import { AuthMethod, AuthProvider } from './user.enums';
import type { IVaultUser } from './user.interface';

const userDefinition = {
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, default: null },
  passwordHash: { type: String, default: null, select: false },
  has_password: { type: Boolean, default: false },
  picture: { type: String, default: null },
  avatar_url: { type: String, default: null },
  auth_provider: { type: String, enum: [...Object.values(AuthProvider), null], default: AuthProvider.Local },
  auth_methods: { type: [String], default: [] },
  provider_id: { type: String, default: null },
  googleId: { type: String, default: null },
  appleId: { type: String, default: null },
  email_verified: { type: Boolean, default: false },
  novasafeEmailVerified: { type: Boolean, default: null },
  isFirstOAuthSignup: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  cloudSyncEnabled: { type: Boolean, default: true },
  cloudSyncUpdatedAt: { type: Date, default: null },
  notificationsEnabled: { type: Boolean, default: true },
  lastVaultSyncedAt: { type: Date, default: null },
  vaultDataRevision: { type: Number, default: 0 },
  vaultDataRevisionUpdatedAt: { type: Date, default: null },
  ...sourceField,
};

export const VaultUserSchema = createBaseSchema(userDefinition);

VaultUserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: partialIndexActiveUser });
VaultUserSchema.index({ googleId: 1 }, { sparse: true });
VaultUserSchema.index({ appleId: 1 }, { sparse: true });
VaultUserSchema.index({ provider_id: 1 }, { sparse: true });
VaultUserSchema.index({ deleted: 1, updatedAt: -1 });

export const VAULT_USER_MODEL_NAME = 'VaultUser';
export const VAULT_USER_COLLECTION = COLLECTIONS.vaultUsers;
