import { ObjectId } from '../../../database/object-id';
import { StorageError, StorageErrorCodes } from '../../../shared/storage';

export type DocumentMetadataPatch = {
  title?: string;
  folderId?: string | null;
};

/**
 * Pure validation for PUT/PATCH document metadata.
 * Does not touch object storage — title/folder only.
 */
export const prepareDocumentMetadataUpdate = (
  documentId: string,
  patch: DocumentMetadataPatch,
): { $set: Record<string, unknown> } => {
  if (!ObjectId.isValid(documentId)) {
    throw new StorageError('Invalid document id', 400, StorageErrorCodes.DOCUMENT_INVALID_ID);
  }

  const $set: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) {
      throw new StorageError(
        'Document title is required.',
        400,
        StorageErrorCodes.DOCUMENT_INVALID_UPLOAD,
      );
    }
    $set.title = title;
  }

  if (patch.folderId !== undefined) {
    if (patch.folderId === null || patch.folderId === '') {
      $set.folderId = null;
    } else if (!ObjectId.isValid(patch.folderId)) {
      throw new StorageError('Invalid folder id', 400, StorageErrorCodes.DOCUMENT_INVALID_ID);
    } else {
      $set.folderId = new ObjectId(patch.folderId);
    }
  }

  return { $set };
};

/** True when the patch would change metadata fields (ignoring empty patches). */
export const hasDocumentMetadataChanges = ($set: Record<string, unknown>): boolean =>
  Object.keys($set).some((k) => k !== 'updatedAt');
