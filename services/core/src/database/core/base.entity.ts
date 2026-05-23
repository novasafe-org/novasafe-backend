import type { Types } from 'mongoose';
import type { EntityId, EntityMetadata } from './database.types';

/**
 * Base domain entity shape for all persisted models.
 * Module entities should extend this interface (or a module-specific extension).
 */
export abstract class BaseEntity {
  _id?: Types.ObjectId | EntityId;

  createdAt?: Date;

  updatedAt?: Date;

  /** Soft-delete timestamp; null when active. */
  deletedAt?: Date | null;

  /** Arbitrary non-sensitive metadata for auditing / client hints. */
  metadata?: EntityMetadata;

  constructor(partial?: Partial<BaseEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }

  get id(): EntityId | undefined {
    if (!this._id) return undefined;
    return typeof this._id === 'string' ? this._id : String(this._id);
  }

  get isDeleted(): boolean {
    return this.deletedAt != null;
  }
}

/**
 * Mongoose document fields shared by base schemas.
 */
export interface IBaseEntityDocument {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  metadata?: EntityMetadata;
}
