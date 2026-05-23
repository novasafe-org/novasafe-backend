import type { Schema } from 'mongoose';

/**
 * Ensures createdAt/updatedAt are set on save when not using Mongoose `timestamps` option.
 * Placeholder plugin — prefer `timestamps: true` on base schema for new models.
 */
export const timestampsPlugin = (schema: Schema): void => {
  schema.pre('save', function setTimestamps(next) {
    const now = new Date();
    if (!this.createdAt) {
      this.createdAt = now;
    }
    this.updatedAt = now;
    next();
  });
};
