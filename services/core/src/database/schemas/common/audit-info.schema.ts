import { Schema } from 'mongoose';

import { objectIdType } from './schema-types';

export const auditFields = {
  createdBy: { type: objectIdType, ref: 'VaultUser', default: null },
  updatedBy: { type: objectIdType, ref: 'VaultUser', default: null },
  createdAt: { type: Date },
  updatedAt: { type: Date },
} as const;

export const AuditInfoSchema = new Schema(
  {
    createdBy: { type: objectIdType, ref: 'VaultUser', default: null },
    updatedBy: { type: objectIdType, ref: 'VaultUser', default: null },
  },
  { _id: false },
);
