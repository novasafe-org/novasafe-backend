/**
 * Canonical NAS folder layout for NovaSafe object storage.
 *
 * ```
 * novasafe/
 *   <userId>/
 *     documents/
 *       <timestamp>-<filename>
 *     items attachments/
 *       <itemId>/
 *         <timestamp>-<filename>
 * ```
 */

export const NAS_ROOT = 'novasafe';
export const NAS_DOCUMENTS_DIR = 'documents';
/** Folder name is intentional (space) — matches product NAS layout. */
export const NAS_ITEM_ATTACHMENTS_DIR = 'items attachments';

/** Strip path traversal / separators from a single path segment. */
export const sanitizePathSegment = (value: string, fallback = 'unknown'): string => {
  const cleaned = String(value || '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.\./g, '_')
    .trim();
  return cleaned || fallback;
};

export const sanitizeFilename = (filename: string): string => {
  const cleaned = String(filename || '')
    .replace(/[\\/]+/g, '_')
    .trim();
  return cleaned || 'upload.bin';
};

const stampedName = (filename: string): string =>
  `${Date.now()}-${sanitizeFilename(filename)}`;

/** `novasafe/<userId>/documents/<timestamp>-<filename>` */
export const buildDocumentRelativePath = (userId: string, filename: string): string => {
  const user = sanitizePathSegment(userId);
  return `${NAS_ROOT}/${user}/${NAS_DOCUMENTS_DIR}/${stampedName(filename)}`;
};

/** `novasafe/<userId>/items attachments/<itemId>/<timestamp>-<filename>` */
export const buildItemAttachmentRelativePath = (
  userId: string,
  itemId: string,
  filename: string,
): string => {
  const user = sanitizePathSegment(userId);
  const item = sanitizePathSegment(itemId);
  return `${NAS_ROOT}/${user}/${NAS_ITEM_ATTACHMENTS_DIR}/${item}/${stampedName(filename)}`;
};
