import { Schema, Types } from 'mongoose';

export const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'VaultUser', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'VaultUser', default: null },
  createdAt: { type: Date },
  updatedAt: { type: Date },
} as const;

export const AuditInfoSchema = new Schema(
  {
    createdBy: { type: Types.ObjectId, ref: 'VaultUser', default: null },
    updatedBy: { type: Types.ObjectId, ref: 'VaultUser', default: null },
  },
  { _id: false },
);
