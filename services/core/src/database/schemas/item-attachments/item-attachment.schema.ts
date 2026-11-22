import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { objectIdType } from '../common/schema-types';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Item attachment metadata — binary on NAS under userId/items attachments/<itemId>. */
const itemAttachmentDefinition = {
  ...userIdField,
  /** Parent vault item id. */
  itemId: { type: objectIdType, required: true, index: true },
  title: { type: String, required: true },
  mimeType: { type: String, default: null },
  sizeBytes: { type: Number, default: 0 },
  /** NAS-Control file id returned from POST /files/upload. */
  storageKey: { type: String, default: null },
  checksum: { type: String, default: null },
  ...sourceField,
};

export const ItemAttachmentSchema = createBaseSchema(itemAttachmentDefinition);
ItemAttachmentSchema.index({ userId: 1, itemId: 1, deleted: 1 });

export const ITEM_ATTACHMENT_MODEL_NAME = 'ItemAttachment';
export const ITEM_ATTACHMENT_COLLECTION = COLLECTIONS.itemAttachments;
