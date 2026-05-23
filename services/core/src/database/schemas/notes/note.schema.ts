import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields } from '../common/encryption.schema';
import { sourceField, syncFields } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Placeholder secure note entity — separate from vault credential items. */
const noteDefinition = {
  ...userIdField,
  title: { type: String, required: true },
  ...encryptionFields,
  tags: { type: [String], default: [] },
  ...syncFields,
  ...sourceField,
};

export const SecureNoteSchema = createBaseSchema(noteDefinition);

export const SECURE_NOTE_MODEL_NAME = 'SecureNote';
export const SECURE_NOTE_COLLECTION = COLLECTIONS.notes;
