import { Schema, Types } from 'mongoose';

/** Use on schemas that define compound indexes including `userId` (avoids duplicate single-field indexes). */
export const userIdField = {
  userId: { type: Schema.Types.ObjectId, ref: 'VaultUser', required: true },
} as const;

export const optionalUserIdField = {
  userId: { type: Types.ObjectId, ref: 'VaultUser', default: null },
} as const;
