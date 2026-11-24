import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields } from '../common/encryption.schema';
import { objectIdType } from '../common/schema-types';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/**
 * Authenticator / TOTP entry.
 *
 * - Standalone: vaultItemId = null (created from Tools → Authenticator).
 * - Item-linked: vaultItemId set when 2FA is added on a vault login (or linked later).
 *
 * TOTP secret lives only in encryptionFields (AES). Issuer / account / hash params
 * stay queryable for the authenticator list UI (otpauth URI metadata).
 */
const authenticatorEntryDefinition = {
  ...userIdField,
  /** Optional link to vaultItems — null for standalone apps. */
  vaultItemId: { type: objectIdType, default: null, sparse: true },
  issuer: { type: String, default: null, trim: true },
  accountName: { type: String, default: null, trim: true },
  /** Encrypted TOTP secret payload (AES-256-GCM via encryptText). */
  ...encryptionFields,
  /** otpauth type — only totp supported for now. */
  type: { type: String, default: 'totp', enum: ['totp', 'hotp'] },
  /** HMAC hash for TOTP (not the AES algorithm field). */
  hashAlgorithm: {
    type: String,
    default: 'SHA1',
    enum: ['SHA1', 'SHA256', 'SHA512'],
  },
  digits: { type: Number, default: 6, min: 6, max: 8 },
  period: { type: Number, default: 30, min: 15, max: 60 },
  /** HOTP counter — unused for totp. */
  counter: { type: Number, default: null },
  lastUsedAt: { type: Date, default: null },
  ...sourceField,
};

export const AuthenticatorEntrySchema = createBaseSchema(authenticatorEntryDefinition);

AuthenticatorEntrySchema.index({ userId: 1, deleted: 1, updatedAt: -1 });
AuthenticatorEntrySchema.index(
  { userId: 1, vaultItemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      vaultItemId: { $type: 'objectId' },
      deleted: { $ne: true },
    },
  },
);

export const AUTHENTICATOR_ENTRY_MODEL_NAME = 'AuthenticatorEntry';
export const AUTHENTICATOR_ENTRY_COLLECTION = COLLECTIONS.authenticatorEntries;

export interface IAuthenticatorEntry {
  userId: unknown;
  vaultItemId?: unknown | null;
  issuer?: string | null;
  accountName?: string | null;
  encrypted_data: string;
  iv: string;
  authTag?: string | null;
  algorithm?: string;
  keyVersion?: number;
  type?: 'totp' | 'hotp';
  hashAlgorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  digits?: number;
  period?: number;
  counter?: number | null;
  lastUsedAt?: Date | null;
}
