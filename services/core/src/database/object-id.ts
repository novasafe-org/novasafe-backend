import { Types } from 'mongoose';

/**
 * Canonical ObjectId for core — always sourced from Mongoose (BSON 6, same as the active driver).
 * Do not import ObjectId from `mongodb` directly; workspace hoisting can resolve driver v5 + BSON 5.
 */
export type ObjectId = Types.ObjectId;
export const ObjectId = Types.ObjectId;

export const isValidObjectId = (id: unknown): id is string =>
  typeof id === 'string' && Types.ObjectId.isValid(id);

/** Normalize string / ObjectId / document id to a driver-safe ObjectId instance. */
export const toObjectId = (id: string | Types.ObjectId | { toString(): string }): Types.ObjectId => {
  if (id instanceof Types.ObjectId) return id;
  return new Types.ObjectId(String(id));
};
