import type { Request, Response } from 'express';
import { AppError } from '../../../shared/errors';
import {
  deleteDocument,
  downloadDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  uploadDocument,
} from '../services/documents.service';

const requireUserId = (req: Request): string | null => req.user?.id || null;
const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

const sendAppError = (res: Response, err: unknown): boolean => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return true;
  }
  return false;
};

const isGenericMime = (mime?: string | null): boolean => {
  const m = (mime || '').trim().toLowerCase();
  return !m || m === 'application/octet-stream' || m === 'binary/octet-stream';
};

const mimeFromFilename = (filename: string): string | undefined => {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'bmp':
      return 'image/bmp';
    case 'txt':
    case 'log':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'csv':
      return 'text/csv';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'zip':
      return 'application/zip';
    default:
      return undefined;
  }
};

/** Prefer concrete MIME from body/part; fall back to extension so PDFs are not stored as octet-stream. */
const resolveUploadMimeType = (
  partMime: string | undefined,
  filename: string,
  bodyMime?: string,
): string => {
  if (bodyMime && !isGenericMime(bodyMime)) return bodyMime;
  if (partMime && !isGenericMime(partMime)) return partMime;
  return mimeFromFilename(filename) || partMime || 'application/octet-stream';
};

export const getDocuments = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  try {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    const data = await listDocuments(userId, { folderId });
    res.status(200).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const getDocument = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  try {
    const doc = await getDocumentById(userId, req.params.id);
    if (!doc) {
      res.status(404).json({ success: false, code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
      return;
    }
    res.status(200).json({ success: true, source: sendSource(req), data: doc });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const uploadDocumentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer?.length) {
    res.status(400).json({
      success: false,
      code: 'DOCUMENT_INVALID_UPLOAD',
      message: 'Invalid file upload. Check the file and try again.',
    });
    return;
  }

  try {
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : undefined;
    const folderId =
      typeof req.body?.folderId === 'string' && req.body.folderId.trim()
        ? req.body.folderId.trim()
        : null;

    const filename = file.originalname || 'upload.bin';
    const bodyMime =
      typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
        ? req.body.mimeType.trim()
        : undefined;
    const mimeType = resolveUploadMimeType(file.mimetype, filename, bodyMime);

    const data = await uploadDocument(userId, {
      title,
      filename,
      mimeType,
      buffer: file.buffer,
      folderId,
    });
    res.status(201).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const updateDocumentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const folderId =
      req.body?.folderId === null
        ? null
        : typeof req.body?.folderId === 'string'
          ? req.body.folderId
          : undefined;

    const data = await updateDocument(userId, req.params.id, { title, folderId });
    res.status(200).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const downloadDocumentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  try {
    const { doc, upstream } = await downloadDocument(userId, req.params.id);
    const contentType =
      upstream.headers.get('content-type') || doc.mimeType || 'application/octet-stream';
    const disposition =
      upstream.headers.get('content-disposition') ||
      `attachment; filename="${encodeURIComponent(doc.title || 'document')}"`;

    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const deleteDocumentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  try {
    await deleteDocument(userId, req.params.id);
    res.status(200).json({ success: true, source: sendSource(req), message: 'Document deleted' });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};
