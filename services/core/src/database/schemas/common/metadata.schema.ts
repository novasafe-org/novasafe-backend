import { Schema } from 'mongoose';

/** Arbitrary non-sensitive key/value metadata stored on entities. */
export const MetadataSchema = new Schema(
  {
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export const metadataField = {
  metadata: { type: Schema.Types.Mixed, default: {} },
} as const;
