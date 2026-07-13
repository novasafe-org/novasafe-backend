import { objectIdType } from './schema-types';

/** Use on schemas that define compound indexes including `userId` (avoids duplicate single-field indexes). */
export const userIdField = {
  userId: { type: objectIdType, ref: 'VaultUser', required: true },
} as const;

export const optionalUserIdField = {
  userId: { type: objectIdType, ref: 'VaultUser', default: null },
} as const;
