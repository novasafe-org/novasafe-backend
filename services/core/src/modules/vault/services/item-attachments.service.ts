import crypto from 'crypto';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { logger } from '../../../shared/logger';
import {
  buildItemAttachmentRelativePath,
  MAX_ATTACHMENTS_PER_ITEM,
  safeStorageDeleteBestEffort,
  safeStorageDownload,
  safeStorageUpload,
  sanitizeFilename,
  StorageError,
  StorageErrorCodes,
  validateUploadPayload,
} from '../../../shared/storage';
import { getItemById } from './vault-items.service';

const db = getNativeMongo();

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const activeFilter = (userId: string, extra: Record<string, unknown> = {}) => ({
  ...userFilter(userId),
  deleted: { $ne: true },
  ...extra,
});

export type ItemAttachmentResponse = {
  id: string;
  itemId: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string | null;
  checksum: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const toAttachmentResponse = (doc: Record<string, unknown>): ItemAttachmentResponse => ({
  id: String((doc as { _id?: { toString?: () => string } })._id?.toString?.() || doc.id || ''),
  itemId: String(doc.itemId || ''),
  title: String(doc.title || ''),
  mimeType: doc.mimeType != null ? String(doc.mimeType) : null,
  sizeBytes: Number(doc.sizeBytes || 0),
  storageKey: doc.storageKey != null ? String(doc.storageKey) : null,
  checksum: doc.checksum != null ? String(doc.checksum) : null,
  createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date).toISOString() : undefined,
  updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : undefined,
});

const assertItemOwned = async (userId: string, itemId: string): Promise<void> => {
  if (!ObjectId.isValid(itemId)) {
    throw new StorageError('Invalid item id', 400, StorageErrorCodes.ATTACHMENT_INVALID_ID);
  }
  const item = await getItemById(userId, itemId, false);
  if (!item) {
    throw new StorageError(
      'Vault item not found.',
      404,
      StorageErrorCodes.ATTACHMENT_ITEM_NOT_FOUND,
    );
  }
};

const assertAttachmentId = (attachmentId: string): void => {
  if (!ObjectId.isValid(attachmentId)) {
    throw new StorageError('Invalid attachment id', 400, StorageErrorCodes.ATTACHMENT_INVALID_ID);
  }
};

const recountAttachments = async (userId: string, itemId: string): Promise<number> => {
  const count = await db.getDb().collection(COLLECTIONS.itemAttachments).countDocuments(
    activeFilter(userId, { itemId: new ObjectId(itemId) }),
  );
  await db.updateOne(
    COLLECTIONS.vaultItems,
    {
      $and: [
        { $or: [{ _id: new ObjectId(itemId) }, { id: itemId }] },
        userFilter(userId),
        { deleted: { $ne: true } },
      ],
    },
    { $set: { attachment_count: count, updatedAt: new Date() } },
  );
  return count;
};

export const listItemAttachments = async (
  userId: string,
  itemId: string,
): Promise<ItemAttachmentResponse[]> => {
  await assertItemOwned(userId, itemId);
  const rows = await db.findMany(
    COLLECTIONS.itemAttachments,
    activeFilter(userId, { itemId: new ObjectId(itemId) }),
    { sort: { updatedAt: -1 }, limit: 100 },
  );
  return rows.map((r) => toAttachmentResponse(r as Record<string, unknown>));
};

export const getItemAttachmentById = async (
  userId: string,
  itemId: string,
  attachmentId: string,
): Promise<ItemAttachmentResponse | null> => {
  await assertItemOwned(userId, itemId);
  assertAttachmentId(attachmentId);
  const doc = await db.findOne(
    COLLECTIONS.itemAttachments,
    activeFilter(userId, {
      _id: new ObjectId(attachmentId),
      itemId: new ObjectId(itemId),
    }),
  );
  if (!doc) return null;
  return toAttachmentResponse(doc as Record<string, unknown>);
};

export const uploadItemAttachment = async (
  userId: string,
  itemId: string,
  input: {
    title?: string;
    filename: string;
    mimeType?: string;
    buffer: Buffer;
  },
): Promise<ItemAttachmentResponse> => {
  await assertItemOwned(userId, itemId);

  validateUploadPayload({
    filename: input.filename,
    sizeBytes: input.buffer?.length ?? 0,
    mimeType: input.mimeType,
    kind: 'attachment',
  });

  const existingCount = await db.getDb().collection(COLLECTIONS.itemAttachments).countDocuments(
    activeFilter(userId, { itemId: new ObjectId(itemId) }),
  );
  if (existingCount >= MAX_ATTACHMENTS_PER_ITEM) {
    throw new StorageError(
      `You can attach up to ${MAX_ATTACHMENTS_PER_ITEM} files per item.`,
      400,
      StorageErrorCodes.ATTACHMENT_LIMIT_EXCEEDED,
    );
  }

  const safeName = sanitizeFilename(input.filename);
  // Layout: novasafe/<userId>/items attachments/<itemId>/<timestamp>-<filename>
  const relativePath = buildItemAttachmentRelativePath(userId, itemId, safeName);
  const checksum = crypto.createHash('sha256').update(input.buffer).digest('hex');

  const stored = await safeStorageUpload({
    filename: safeName,
    mimeType: input.mimeType,
    buffer: input.buffer,
    relativePath,
  });

  const now = new Date();
  const title = (input.title || safeName).trim() || safeName;
  const insert = {
    userId: new ObjectId(userId),
    itemId: new ObjectId(itemId),
    title,
    mimeType: input.mimeType || stored.mimeType || null,
    sizeBytes: input.buffer.length || stored.sizeBytes || 0,
    storageKey: stored.storageKey,
    checksum,
    source: 'mobile',
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.insertOne(COLLECTIONS.itemAttachments, insert);
  await recountAttachments(userId, itemId);
  return toAttachmentResponse({ ...insert, _id: result.insertedId });
};

export const downloadItemAttachment = async (
  userId: string,
  itemId: string,
  attachmentId: string,
): Promise<{ attachment: ItemAttachmentResponse; upstream: Response }> => {
  const attachment = await getItemAttachmentById(userId, itemId, attachmentId);
  if (!attachment?.storageKey) {
    throw new StorageError('Attachment not found.', 404, StorageErrorCodes.ATTACHMENT_NOT_FOUND);
  }
  const upstream = await safeStorageDownload(attachment.storageKey);
  return { attachment, upstream };
};

export const deleteItemAttachment = async (
  userId: string,
  itemId: string,
  attachmentId: string,
): Promise<void> => {
  const attachment = await getItemAttachmentById(userId, itemId, attachmentId);
  if (!attachment) {
    throw new StorageError('Attachment not found.', 404, StorageErrorCodes.ATTACHMENT_NOT_FOUND);
  }

  // Soft-delete Mongo first so a NAS failure cannot leave the attachment listed.
  const result = await db.updateOne(
    COLLECTIONS.itemAttachments,
    {
      _id: new ObjectId(attachmentId),
      itemId: new ObjectId(itemId),
      ...userFilter(userId),
      deleted: { $ne: true },
    },
    {
      $set: {
        deleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
        storageKey: null,
      },
    },
  );
  if (!result.matchedCount) {
    throw new StorageError('Attachment not found.', 404, StorageErrorCodes.ATTACHMENT_NOT_FOUND);
  }

  if (attachment.storageKey) {
    await safeStorageDeleteBestEffort(attachment.storageKey, {
      userId,
      itemId,
      attachmentId,
      op: 'deleteItemAttachment',
    });
  }

  await recountAttachments(userId, itemId);
};

/** Soft-delete + best-effort NAS cleanup for all attachments on a vault item. */
export const deleteAllAttachmentsForItem = async (
  userId: string,
  itemId: string,
): Promise<void> => {
  if (!ObjectId.isValid(itemId)) return;

  const rows = await db.findMany(
    COLLECTIONS.itemAttachments,
    activeFilter(userId, { itemId: new ObjectId(itemId) }),
    { limit: 500 },
  );

  // Soft-delete metadata first so list/download never race with NAS cleanup.
  await db.getDb().collection(COLLECTIONS.itemAttachments).updateMany(
    activeFilter(userId, { itemId: new ObjectId(itemId) }),
    {
      $set: {
        deleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
        storageKey: null,
      },
    },
  );

  for (const row of rows) {
    const storageKey = (row as { storageKey?: string }).storageKey;
    if (!storageKey) continue;
    await safeStorageDeleteBestEffort(storageKey, {
      userId,
      itemId,
      op: 'deleteAllAttachmentsForItem',
    });
  }

  try {
    await recountAttachments(userId, itemId);
  } catch (err) {
    logger.warn('Failed to recount attachments after item cleanup', {
      userId,
      itemId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
};
