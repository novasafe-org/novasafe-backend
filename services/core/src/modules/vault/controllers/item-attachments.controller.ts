import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import { AppError } from '../../../shared/errors';
import { StorageErrorCodes } from '../../../shared/storage';
import {
  deleteItemAttachment,
  downloadItemAttachment,
  getItemAttachmentById,
  listItemAttachments,
  uploadItemAttachment,
} from '../services/item-attachments.service';

const requireUserId = (req: Request): string | null => req.user?.id || null;
const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

const sendAppError = (res: Response, err: unknown): boolean => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return true;
  }
  return false;
};

const rejectInvalidId = (
  res: Response,
  value: string | undefined,
  label: 'item' | 'attachment',
): boolean => {
  if (value && ObjectId.isValid(value)) return false;
  res.status(400).json({
    success: false,
    code: StorageErrorCodes.ATTACHMENT_INVALID_ID,
    message: label === 'item' ? 'Invalid item id' : 'Invalid attachment id',
  });
  return true;
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
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'zip':
      return 'application/zip';
    default:
      return undefined;
  }
};

const resolveUploadMimeType = (
  partMime: string | undefined,
  filename: string,
  bodyMime?: string,
): string => {
  if (bodyMime && !isGenericMime(bodyMime)) return bodyMime;
  if (partMime && !isGenericMime(partMime)) return partMime;
  return mimeFromFilename(filename) || partMime || 'application/octet-stream';
};

export const listItemAttachmentsHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (rejectInvalidId(res, req.params.itemId, 'item')) return;
  try {
    const data = await listItemAttachments(userId, req.params.itemId);
    res.status(200).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const getItemAttachmentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (rejectInvalidId(res, req.params.itemId, 'item')) return;
  if (rejectInvalidId(res, req.params.attachmentId, 'attachment')) return;
  try {
    const data = await getItemAttachmentById(userId, req.params.itemId, req.params.attachmentId);
    if (!data) {
      res.status(404).json({
        success: false,
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found.',
      });
      return;
    }
    res.status(200).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const uploadItemAttachmentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (rejectInvalidId(res, req.params.itemId, 'item')) return;

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer?.length) {
    res.status(400).json({
      success: false,
      code: StorageErrorCodes.ATTACHMENT_INVALID_UPLOAD,
      message: 'Invalid file upload. Check the file and try again.',
    });
    return;
  }

  try {
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : undefined;
    const filename = file.originalname || 'upload.bin';
    const bodyMime =
      typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
        ? req.body.mimeType.trim()
        : undefined;
    const mimeType = resolveUploadMimeType(file.mimetype, filename, bodyMime);

    const data = await uploadItemAttachment(userId, req.params.itemId, {
      title,
      filename,
      mimeType,
      buffer: file.buffer,
    });
    res.status(201).json({ success: true, source: sendSource(req), data });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const downloadItemAttachmentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (rejectInvalidId(res, req.params.itemId, 'item')) return;
  if (rejectInvalidId(res, req.params.attachmentId, 'attachment')) return;
  try {
    const { attachment, upstream } = await downloadItemAttachment(
      userId,
      req.params.itemId,
      req.params.attachmentId,
    );
    const contentType =
      upstream.headers.get('content-type') ||
      attachment.mimeType ||
      'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.title || 'attachment')}"`,
    );
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};

export const deleteItemAttachmentHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (rejectInvalidId(res, req.params.itemId, 'item')) return;
  if (rejectInvalidId(res, req.params.attachmentId, 'attachment')) return;
  try {
    await deleteItemAttachment(userId, req.params.itemId, req.params.attachmentId);
    res.status(200).json({ success: true, source: sendSource(req), message: 'Attachment deleted' });
  } catch (err) {
    if (sendAppError(res, err)) return;
    throw err;
  }
};
