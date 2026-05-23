import { Schema } from 'mongoose';

/**
 * Reusable encrypted payload structure (AES-256-GCM style blobs).
 * Encryption/decryption logic is implemented in services — not here.
 */
export const EncryptionPayloadSchema = new Schema(
  {
    encrypted_data: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, default: null },
    algorithm: { type: String, default: 'aes-256-gcm' },
    keyVersion: { type: Number, default: 1 },
    keyReference: { type: String, default: null },
  },
  { _id: false },
);

export const encryptionFields = {
  encrypted_data: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, default: null },
  algorithm: { type: String, default: 'aes-256-gcm' },
  keyVersion: { type: Number, default: 1 },
  keyReference: { type: String, default: null },
} as const;

/** Optional plaintext field when value is not sensitive. */
export const optionalPlaintextValueField = {
  field_value: { type: String, default: null },
} as const;
