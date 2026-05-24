import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import { assertCanCreateVaultItem } from '../../auth/adapters/subscription.adapter';
import {
  addCustomField,
  syncBulkUpload,
  createItem,
  deleteCustomField,
  deleteItemById,
  deletePasswordVersion,
  getItemById,
  getVaultDataRevisionForUser,
  listItems,
  markPasswordVersionExpired,
  pullSyncDeltaItems,
  updateCustomField,
  updateItemById,
} from '../services/vault-items.service';
import { toMobileItemDetail, toMobileItemSummary } from '../utils/mobile-item.formatter';

const pagination = (req: Request) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  return { page, limit };
};

const requireUserId = (req: Request): string | null => req.user?.id || null;

const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

export const getVaultRevision = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const revision = await getVaultDataRevisionForUser(userId);
  res.status(200).json({ success: true, source: sendSource(req), revision });
};

export const getVaultItems = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const { page, limit } = pagination(req);
  const { items, total } = await listItems(userId, page, limit);
  res.status(200).json({
    success: true,
    source: sendSource(req),
    pagination: { page, limit, total, hasNext: page * limit < total },
    data: items.map((item) => toMobileItemSummary(item as Record<string, unknown>)),
  });
};

export const getVaultItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid item id' });
    return;
  }
  const revealSensitive = String(req.query.revealSensitive || 'false') === 'true';
  const item = await getItemById(userId, req.params.id, revealSensitive);
  if (!item) {
    res.status(404).json({ success: false, message: 'Item not found' });
    return;
  }
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail(item as Record<string, unknown>),
  });
};

export const createVaultItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!req.body?.title || !(req.body?.category || req.body?.type)) {
    res.status(400).json({ success: false, message: 'title and category/type are required' });
    return;
  }
  const category = String(req.body?.category || req.body?.type || 'login');
  const allowed = await assertCanCreateVaultItem(userId, category);
  if (!allowed.ok && 'message' in allowed) {
    res.status(403).json({
      success: false,
      code: 'NOVASAFE_SUBSCRIPTION_REQUIRED',
      message: allowed.message,
      subscription: allowed.state,
    });
    return;
  }
  const item = await createItem(userId, req.body);
  res.status(201).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail(item as Record<string, unknown>),
  });
};

export const updateVaultItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid item id' });
    return;
  }
  const item = await updateItemById(userId, req.params.id, req.body || {});
  if (!item) {
    res.status(404).json({ success: false, message: 'Item not found' });
    return;
  }
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail(item as Record<string, unknown>),
  });
};

export const deleteVaultItem = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid item id' });
    return;
  }
  const deleted = await deleteItemById(userId, req.params.id);
  if (!deleted) {
    res.status(404).json({ success: false, message: 'Item not found' });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), message: 'Item deleted' });
};

export const expirePasswordVersion = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.versionId)) {
    res.status(400).json({ success: false, message: 'Invalid id or version id' });
    return;
  }
  const ok = await markPasswordVersionExpired(userId, req.params.id, req.params.versionId);
  if (!ok) {
    res.status(404).json({ success: false, message: 'Password version not found' });
    return;
  }
  const item = await getItemById(userId, req.params.id);
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail((item || {}) as Record<string, unknown>),
  });
};

export const deletePasswordVersionById = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.versionId)) {
    res.status(400).json({ success: false, message: 'Invalid id or version id' });
    return;
  }
  try {
    const ok = await deletePasswordVersion(userId, req.params.id, req.params.versionId);
    if (!ok) {
      res.status(404).json({ success: false, message: 'Password version not found' });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete password version';
    res.status(400).json({ success: false, message });
    return;
  }
  const item = await getItemById(userId, req.params.id);
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail((item || {}) as Record<string, unknown>),
  });
};

export const addItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid item id' });
    return;
  }
  try {
    const item = await addCustomField(userId, req.params.id, req.body || {});
    if (!item) {
      res.status(404).json({ success: false, message: 'Item not found' });
      return;
    }
    res.status(201).json({
      success: true,
      source: sendSource(req),
      data: toMobileItemDetail(item as Record<string, unknown>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add custom field';
    res.status(400).json({ success: false, message });
  }
};

export const updateItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.fieldId)) {
    res.status(400).json({ success: false, message: 'Invalid item id or field id' });
    return;
  }
  try {
    const item = await updateCustomField(userId, req.params.id, req.params.fieldId, req.body || {});
    if (!item) {
      res.status(404).json({ success: false, message: 'Custom field not found' });
      return;
    }
    res.status(200).json({
      success: true,
      source: sendSource(req),
      data: toMobileItemDetail(item as Record<string, unknown>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update custom field';
    res.status(400).json({ success: false, message });
  }
};

export const deleteItemCustomField = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.fieldId)) {
    res.status(400).json({ success: false, message: 'Invalid item id or field id' });
    return;
  }
  const item = await deleteCustomField(userId, req.params.id, req.params.fieldId);
  if (!item) {
    res.status(404).json({ success: false, message: 'Custom field not found' });
    return;
  }
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail(item as Record<string, unknown>),
  });
};

export const vaultBulkSyncUpload = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await syncBulkUpload(userId, req.body || {});
  res.status(200).json({ success: true, source: sendSource(req), ...result });
};

export const vaultPullSyncDelta = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const since = typeof req.query.since === 'string' ? req.query.since : undefined;
  const data = await pullSyncDeltaItems(userId, since);
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: data.map((item) => toMobileItemDetail(item as Record<string, unknown>)),
  });
};
