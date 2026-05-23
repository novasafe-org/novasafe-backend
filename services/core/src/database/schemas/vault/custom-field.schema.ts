import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields, optionalPlaintextValueField } from '../common/encryption.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import { CustomFieldType } from './vault.enums';
import type { ICustomField } from './vault.interface';

const customFieldDefinition = {
  ...userIdField,
  credentialId: { type: Schema.Types.ObjectId, required: true, ref: 'VaultItem' },
  field_label: { type: String, required: true },
  field_type: { type: String, required: true, enum: Object.values(CustomFieldType) },
  is_sensitive: { type: Boolean, default: false },
  ...optionalPlaintextValueField,
  encrypted_data: { type: String, default: null },
  iv: { type: String, default: null },
  authTag: { type: String, default: null },
  algorithm: encryptionFields.algorithm,
  keyVersion: encryptionFields.keyVersion,
  keyReference: encryptionFields.keyReference,
  ...sourceField,
};

export const CustomFieldSchema = createBaseSchema(customFieldDefinition);

CustomFieldSchema.index({ userId: 1, credentialId: 1, deleted: 1 });
CustomFieldSchema.index({ credentialId: 1, field_label: 1 });

export const CUSTOM_FIELD_MODEL_NAME = 'CustomField';
export const CUSTOM_FIELD_COLLECTION = COLLECTIONS.customFields;

export type { ICustomField };
