import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  addCustomField,
  createItem,
  deleteCustomField,
  deleteItemById,
  deletePasswordVersion,
  getItemById,
  listItems,
  markPasswordVersionExpired,
  updateCustomField,
  updateItemById,
} from '../services/mobileVaultService';
import { toMobileItemDetail, toMobileItemSummary } from '../utils/mobileItemFormatter';

const pagination = (req: Request) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  return { page, limit };
};

const requireUserId = (req: Request): string | null => req.user?.id || null;

export const getMobileItems = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });

  const { page, limit } = pagination(req);
  const { items, total } = await listItems(userId, page, limit);

  res.status(200).json({
    success: true,
    source: req.source,
    pagination: { page, limit, total, hasNext: page * limit < total },
    data: items.map(toMobileItemSummary),
  });
};

export const getMobileItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id)) return void res.status(400).json({ success: false, message: 'Invalid item id' });

  const revealSensitive = String(req.query.revealSensitive || 'false') === 'true';
  const item = await getItemById(userId, req.params.id, revealSensitive);
  if (!item) return void res.status(404).json({ success: false, message: 'Item not found' });

  res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};

export const createMobileItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!req.body?.title || !(req.body?.category || req.body?.type)) {
    return void res.status(400).json({ success: false, message: 'title and category/type are required' });
  }

  const item = await createItem(userId, req.body);
  res.status(201).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};

export const updateMobileItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id)) return void res.status(400).json({ success: false, message: 'Invalid item id' });

  const item = await updateItemById(userId, req.params.id, req.body || {});
  if (!item) return void res.status(404).json({ success: false, message: 'Item not found' });

  res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};

export const deleteMobileItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id)) return void res.status(400).json({ success: false, message: 'Invalid item id' });

  const deleted = await deleteItemById(userId, req.params.id);
  if (!deleted) return void res.status(404).json({ success: false, message: 'Item not found' });

  res.status(200).json({ success: true, source: req.source, message: 'Item deleted' });
};

export const expirePasswordVersion = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.versionId)) {
    return void res.status(400).json({ success: false, message: 'Invalid id or version id' });
  }
  const ok = await markPasswordVersionExpired(userId, req.params.id, req.params.versionId);
  if (!ok) return void res.status(404).json({ success: false, message: 'Password version not found' });
  const item = await getItemById(userId, req.params.id);
  res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};

export const deletePasswordVersionById = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.versionId)) {
    return void res.status(400).json({ success: false, message: 'Invalid id or version id' });
  }
  try {
    const ok = await deletePasswordVersion(userId, req.params.id, req.params.versionId);
    if (!ok) return void res.status(404).json({ success: false, message: 'Password version not found' });
  } catch (error: any) {
    return void res.status(400).json({ success: false, message: error?.message || 'Unable to delete password version' });
  }
  const item = await getItemById(userId, req.params.id);
  res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};

export const addItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id)) return void res.status(400).json({ success: false, message: 'Invalid item id' });
  try {
    const item = await addCustomField(userId, req.params.id, req.body || {});
    if (!item) return void res.status(404).json({ success: false, message: 'Item not found' });
    res.status(201).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Unable to add custom field' });
  }
};

export const updateItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.fieldId)) {
    return void res.status(400).json({ success: false, message: 'Invalid item id or field id' });
  }
  try {
    const item = await updateCustomField(userId, req.params.id, req.params.fieldId, req.body || {});
    if (!item) return void res.status(404).json({ success: false, message: 'Custom field not found' });
    res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Unable to update custom field' });
  }
};

export const deleteItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.fieldId)) {
    return void res.status(400).json({ success: false, message: 'Invalid item id or field id' });
  }
  const item = await deleteCustomField(userId, req.params.id, req.params.fieldId);
  if (!item) return void res.status(404).json({ success: false, message: 'Custom field not found' });
  res.status(200).json({ success: true, source: req.source, data: toMobileItemDetail(item) });
};
