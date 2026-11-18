import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { objectIdType } from '../common/schema-types';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Document metadata — binary stored on NAS-Control; `storageKey` = NAS file id. */
const documentDefinition = {
  ...userIdField,
  title: { type: String, required: true },
  mimeType: { type: String, default: null },
  sizeBytes: { type: Number, default: 0 },
  /** NAS-Control file id returned from POST /files/upload. */
  storageKey: { type: String, default: null },
  checksum: { type: String, default: null },
  folderId: { type: objectIdType, default: null, sparse: true },
  ...sourceField,
};

export const DocumentSchema = createBaseSchema(documentDefinition);

export const DOCUMENT_MODEL_NAME = 'Document';
export const DOCUMENT_COLLECTION = COLLECTIONS.documents;
