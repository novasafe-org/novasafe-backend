import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import {
  createFolder,
  deleteFolder,
  getFolderById,
  listFolders,
  updateFolder,
} from '../services/folders.service';

const requireUserId = (req: Request): string | null => req.user?.id || null;
const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

export const getFolders = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const data = await listFolders(userId);
  res.status(200).json({ success: true, source: sendSource(req), data });
};

export const getFolder = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid folder id' });
    return;
  }
  const folder = await getFolderById(userId, req.params.id);
  if (!folder) {
    res.status(404).json({ success: false, message: 'Folder not found' });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: folder });
};

export const createFolderHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await createFolder(userId, req.body?.name);
  if (!result.ok) {
    const status = result.error.code === 'FOLDER_NAME_EXISTS' ? 409 : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(201).json({ success: true, source: sendSource(req), data: result.folder });
};

export const updateFolderHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid folder id' });
    return;
  }
  const result = await updateFolder(userId, req.params.id, req.body?.name);
  if (!result.ok) {
    const status =
      result.error.code === 'FOLDER_NOT_FOUND'
        ? 404
        : result.error.code === 'FOLDER_NAME_EXISTS'
          ? 409
          : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: result.folder });
};

export const deleteFolderHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid folder id' });
    return;
  }
  const result = await deleteFolder(userId, req.params.id);
  if (!result.ok) {
    const status =
      result.error.code === 'FOLDER_NOT_FOUND'
        ? 404
        : result.error.code === 'FOLDER_NOT_EMPTY'
          ? 409
          : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), message: 'Folder deleted' });
};
