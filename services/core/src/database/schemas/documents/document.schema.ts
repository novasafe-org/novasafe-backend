import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Placeholder document metadata (binary stored in object storage later). */
const documentDefinition = {
  ...userIdField,
  title: { type: String, required: true },
  mimeType: { type: String, default: null },
  sizeBytes: { type: Number, default: 0 },
  storageKey: { type: String, default: null },
  checksum: { type: String, default: null },
  folderId: { type: Schema.Types.ObjectId, default: null, sparse: true },
  ...sourceField,
};

export const DocumentSchema = createBaseSchema(documentDefinition);

export const DOCUMENT_MODEL_NAME = 'Document';
export const DOCUMENT_COLLECTION = COLLECTIONS.documents;
