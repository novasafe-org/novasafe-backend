import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Dedicated folders for Cards (not vault `folders` / documents). */
const cardFolderDefinition = {
  ...userIdField,
  name: { type: String, required: true },
  color: { type: String, default: null },
  icon: { type: String, default: null },
  ...sourceField,
};

export const CardFolderSchema = createBaseSchema(cardFolderDefinition);

export const CARD_FOLDER_MODEL_NAME = 'CardFolder';
export const CARD_FOLDER_COLLECTION = COLLECTIONS.cardFolders;
