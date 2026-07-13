/**
 * String schema types for Mongoose definitions.
 * esbuild bundles break `Schema.Types.ObjectId` at runtime; string names are stable.
 */
export const objectIdType = 'ObjectId' as const;
export const mixedType = 'Mixed' as const;
