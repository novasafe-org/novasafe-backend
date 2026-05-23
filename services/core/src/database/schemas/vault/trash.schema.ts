/**
 * Trash / soft-delete uses `deleted`, `deletedAt`, and legacy `deleted_at` on vault items.
 */
export const VAULT_TRASH_FILTER = {
  deleted: true,
} as const;

export const VAULT_ACTIVE_FILTER = {
  deleted: { $ne: true },
  deleted_at: null,
} as const;
