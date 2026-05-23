import type { Schema } from 'mongoose';

/**
 * Soft-delete placeholder: sets deletedAt instead of physical removal.
 * Extend with query middleware (exclude deleted) when business modules are added.
 */
export const softDeletePlugin = (schema: Schema): void => {
  schema.methods.softDelete = async function softDelete() {
    this.deletedAt = new Date();
    return this.save();
  };

  schema.methods.restore = async function restore() {
    this.deletedAt = null;
    return this.save();
  };
};
