import { StorageError, StorageErrorCodes, type StorageErrorCode } from './storage.errors';

/** Aligned with Flutter `DocumentUploadGuards` and multer `NAS_MAX_UPLOAD_BYTES`. */
export const MAX_UPLOAD_BYTES = Number(process.env.NAS_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
export const MAX_UPLOAD_SIZE_LABEL = '10 MB';
export const MAX_ATTACHMENTS_PER_ITEM = 10;

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'bmp',
  'txt',
  'md',
  'csv',
  'log',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'zip',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'flv',
  '3gp',
  'mpeg',
  'mpg',
]);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/bmp',
  'image/x-ms-bmp',
]);

export type UploadGuardKind = 'document' | 'attachment';

const codesFor = (
  kind: UploadGuardKind,
): {
  empty: StorageErrorCode;
  tooLarge: StorageErrorCode;
  unsupported: StorageErrorCode;
} =>
  kind === 'attachment'
    ? {
        empty: StorageErrorCodes.ATTACHMENT_INVALID_UPLOAD,
        tooLarge: StorageErrorCodes.ATTACHMENT_TOO_LARGE,
        unsupported: StorageErrorCodes.ATTACHMENT_UNSUPPORTED_TYPE,
      }
    : {
        empty: StorageErrorCodes.DOCUMENT_INVALID_UPLOAD,
        tooLarge: StorageErrorCodes.DOCUMENT_TOO_LARGE,
        unsupported: StorageErrorCodes.DOCUMENT_UNSUPPORTED_TYPE,
      };

const extensionOf = (filename: string): string => {
  const base = filename.includes('/') ? filename.split('/').pop()! : filename;
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
};

const isVideo = (ext: string, mime: string): boolean => {
  if (mime.startsWith('video/')) return true;
  return VIDEO_EXTENSIONS.has(ext);
};

const isAllowed = (ext: string, mime: string): boolean => {
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true;
  if (!mime) return false;
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('image/')) return ALLOWED_IMAGE_MIMES.has(mime);
  if (mime === 'text/plain' || mime === 'text/csv' || mime === 'text/markdown') return true;
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return true;
  }
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return true;
  return false;
};

/**
 * Validates upload bytes/type before NAS write.
 * Throws [StorageError] with client-safe messages.
 */
export const validateUploadPayload = (input: {
  filename: string;
  sizeBytes: number;
  mimeType?: string | null;
  kind?: UploadGuardKind;
}): void => {
  const kind = input.kind ?? 'document';
  const codes = codesFor(kind);
  const filename = (input.filename || '').trim() || 'upload.bin';
  const mime = (input.mimeType || '').trim().toLowerCase();
  const ext = extensionOf(filename);

  if (!input.sizeBytes || input.sizeBytes <= 0) {
    throw new StorageError(
      'Could not read that file. Try another one.',
      400,
      codes.empty,
    );
  }

  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new StorageError(
      `This file is too large. Maximum size is ${MAX_UPLOAD_SIZE_LABEL}.`,
      413,
      codes.tooLarge,
    );
  }

  if (isVideo(ext, mime)) {
    throw new StorageError(
      "Video files can't be uploaded. Please choose a document, image, or PDF.",
      400,
      codes.unsupported,
    );
  }

  if (!isAllowed(ext, mime)) {
    throw new StorageError(
      'Only document files are supported — PDF, images, text, Word, Excel, or ZIP.',
      400,
      codes.unsupported,
    );
  }
};
