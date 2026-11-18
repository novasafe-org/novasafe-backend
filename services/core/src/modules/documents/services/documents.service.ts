import crypto from 'crypto';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { AppError } from '../../../shared/errors';
import {
  getStorage,
  StorageError,
  StorageErrorCodes,
} from '../../../shared/storage';
import {
  hasDocumentMetadataChanges,
  prepareDocumentMetadataUpdate,
} from './documents-update.helpers';

const db = getNativeMongo();

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const activeFilter = (userId: string, extra: Record<string, unknown> = {}) => ({
  ...userFilter(userId),
  deleted: { $ne: true },
  ...extra,
});

export type DocumentResponse = {
  id: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string | null;
  checksum: string | null;
  folderId: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const toDocumentResponse = (doc: Record<string, unknown>): DocumentResponse => ({
  id: String((doc as { _id?: { toString?: () => string } })._id?.toString?.() || doc.id || ''),
  title: String(doc.title || ''),
  mimeType: doc.mimeType != null ? String(doc.mimeType) : null,
  sizeBytes: Number(doc.sizeBytes || 0),
  storageKey: doc.storageKey != null ? String(doc.storageKey) : null,
  checksum: doc.checksum != null ? String(doc.checksum) : null,
  folderId: doc.folderId != null ? String(doc.folderId) : null,
  createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date).toISOString() : undefined,
  updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : undefined,
});

export const listDocuments = async (
  userId: string,
  opts?: { folderId?: string; limit?: number },
): Promise<DocumentResponse[]> => {
  const extra: Record<string, unknown> = {};
  if (opts?.folderId) {
    if (!ObjectId.isValid(opts.folderId)) {
      throw new StorageError('Invalid folder id', 400, StorageErrorCodes.DOCUMENT_INVALID_ID);
    }
    extra.folderId = new ObjectId(opts.folderId);
  }
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const rows = await db.findMany(COLLECTIONS.documents, activeFilter(userId, extra), {
    sort: { updatedAt: -1 },
    limit,
  });
  return rows.map((r) => toDocumentResponse(r as Record<string, unknown>));
};

export const getDocumentById = async (
  userId: string,
  documentId: string,
): Promise<DocumentResponse | null> => {
  if (!ObjectId.isValid(documentId)) {
    throw new StorageError('Invalid document id', 400, StorageErrorCodes.DOCUMENT_INVALID_ID);
  }
  const doc = await db.findOne(
    COLLECTIONS.documents,
    activeFilter(userId, { _id: new ObjectId(documentId) }),
  );
  if (!doc) return null;
  return toDocumentResponse(doc as Record<string, unknown>);
};

export const uploadDocument = async (
  userId: string,
  input: {
    title?: string;
    filename: string;
    mimeType?: string;
    buffer: Buffer;
    folderId?: string | null;
  },
): Promise<DocumentResponse> => {
  if (!input.buffer?.length) {
    throw new StorageError(
      'Invalid file upload. Check the file and try again.',
      400,
      StorageErrorCodes.DOCUMENT_INVALID_UPLOAD,
    );
  }

  let folderId: ObjectId | null = null;
  if (input.folderId) {
    if (!ObjectId.isValid(input.folderId)) {
      throw new StorageError('Invalid folder id', 400, StorageErrorCodes.DOCUMENT_INVALID_ID);
    }
    folderId = new ObjectId(input.folderId);
  }

  const safeName = input.filename.replace(/[\\/]+/g, '_').trim() || 'upload.bin';
  const relativePath = `novasafe/${userId}/${Date.now()}-${safeName}`;
  const checksum = crypto.createHash('sha256').update(input.buffer).digest('hex');

  const stored = await getStorage().upload({
    filename: safeName,
    mimeType: input.mimeType,
    buffer: input.buffer,
    relativePath,
  });

  const now = new Date();
  const title = (input.title || safeName).trim() || safeName;
  const insert = {
    userId: new ObjectId(userId),
    title,
    mimeType: input.mimeType || stored.mimeType || null,
    sizeBytes: input.buffer.length || stored.sizeBytes || 0,
    storageKey: stored.storageKey,
    checksum,
    folderId,
    source: 'mobile',
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.insertOne(COLLECTIONS.documents, insert);
  return toDocumentResponse({ ...insert, _id: result.insertedId });
};

/**
 * Update document metadata (title, folder). Does not call object storage.
 */
export const updateDocument = async (
  userId: string,
  documentId: string,
  patch: { title?: string; folderId?: string | null },
): Promise<DocumentResponse> => {
  const { $set: fields } = prepareDocumentMetadataUpdate(documentId, patch);

  const existing = await db.findOne(
    COLLECTIONS.documents,
    activeFilter(userId, { _id: new ObjectId(documentId) }),
  );
  if (!existing) {
    throw new StorageError('Document not found.', 404, StorageErrorCodes.DOCUMENT_NOT_FOUND);
  }

  if (!hasDocumentMetadataChanges(fields)) {
    return toDocumentResponse(existing as Record<string, unknown>);
  }

  const $set = { ...fields, updatedAt: new Date() };
  await db.updateOne(
    COLLECTIONS.documents,
    { _id: new ObjectId(documentId), ...userFilter(userId), deleted: { $ne: true } },
    { $set },
  );

  const updated = await db.findOne(
    COLLECTIONS.documents,
    activeFilter(userId, { _id: new ObjectId(documentId) }),
  );
  if (!updated) {
    throw new StorageError('Document not found.', 404, StorageErrorCodes.DOCUMENT_NOT_FOUND);
  }
  return toDocumentResponse(updated as Record<string, unknown>);
};

export const downloadDocument = async (
  userId: string,
  documentId: string,
): Promise<{ doc: DocumentResponse; upstream: Response }> => {
  const doc = await getDocumentById(userId, documentId);
  if (!doc?.storageKey) {
    throw new StorageError('Document not found.', 404, StorageErrorCodes.DOCUMENT_NOT_FOUND);
  }
  const upstream = await getStorage().download(doc.storageKey);
  return { doc, upstream };
};

export const deleteDocument = async (userId: string, documentId: string): Promise<void> => {
  const doc = await getDocumentById(userId, documentId);
  if (!doc) {
    throw new StorageError('Document not found.', 404, StorageErrorCodes.DOCUMENT_NOT_FOUND);
  }

  if (doc.storageKey) {
    try {
      await getStorage().delete(doc.storageKey);
    } catch (err) {
      const missing =
        err instanceof AppError &&
        (err.code === StorageErrorCodes.STORAGE_OBJECT_NOT_FOUND ||
          err.code === StorageErrorCodes.DOCUMENT_NOT_FOUND);
      if (!missing) throw err;
    }
  }

  await db.updateOne(
    COLLECTIONS.documents,
    { _id: new ObjectId(documentId), ...userFilter(userId) },
    {
      $set: {
        deleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
        storageKey: null,
      },
    },
  );
};
