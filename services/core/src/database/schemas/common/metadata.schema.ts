import { Schema } from 'mongoose';

import { mixedType } from './schema-types';

/** Arbitrary non-sensitive key/value metadata stored on entities. */
export const MetadataSchema = new Schema(
  {
    metadata: { type: mixedType, default: {} },
  },
  { _id: false },
);

export const metadataField = {
  metadata: { type: mixedType, default: {} },
} as const;
