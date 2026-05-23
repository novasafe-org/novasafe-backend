/**
 * Soft-delete fields used across mobile_vault collections.
 * Supports both `deleted` boolean and `deletedAt` / `deleted_at` for compatibility.
 */
export const softDeleteFields = {
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  /** Legacy field name on vault items */
  deleted_at: { type: Date, default: null },
} as const;
