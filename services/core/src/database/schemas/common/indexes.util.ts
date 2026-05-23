/**
 * Partial index filters compatible with MongoDB partial indexes.
 * Only equality / range / $exists:true / $type are allowed — not `$ne` or `$exists: false`.
 * Schemas default `deleted` and `revoked` to false so active rows are indexed.
 */
export const partialIndexActiveUser = { deleted: false } as const;

export const partialIndexActiveSession = { revoked: false } as const;
