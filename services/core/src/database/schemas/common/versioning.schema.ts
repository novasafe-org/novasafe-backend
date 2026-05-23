/** Optimistic / revision placeholders for sync and audit. */
export const versioningFields = {
  schemaVersion: { type: Number, default: 1 },
  revision: { type: Number, default: 0 },
} as const;
