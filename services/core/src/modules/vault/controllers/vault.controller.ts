import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import { AppError } from '../../../shared/errors';
import {
  assertCanCreateVaultItem,
  assertCanModifyVault,
} from '../../auth/adapters/subscription.adapter';
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
  moveItemToFolder,
  pullSyncDeltaItems,
  updateCustomField,
  updateItemById,
} from '../services/vault-items.service';
import {
  ACCESS_REVOKED_ERROR,
  findShareAccessForItem,
  hasRevokedShareAccessForItem,
} from '../../sharing/services/sharing.service';
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
  const folderIdRaw = req.query.folderId;
  const unfiled =
    String(req.query.unfiled || '') === 'true' ||
    String(folderIdRaw || '').toLowerCase() === 'none' ||
    String(folderIdRaw || '').toLowerCase() === 'null';
  const folderId =
    !unfiled && typeof folderIdRaw === 'string' && folderIdRaw.trim()
      ? folderIdRaw.trim()
      : undefined;
  const { items, total } = await listItems(userId, page, limit, { folderId, unfiled });
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
  let item = await getItemById(userId, req.params.id, revealSensitive);
  let sharedPermission: string | undefined;
  if (!item) {
    const access = await findShareAccessForItem(
      userId,
      req.user?.email || '',
      req.params.id,
      'view',
    );
    if (access?.ownerUserId) {
      item = await getItemById(access.ownerUserId, req.params.id, revealSensitive);
      sharedPermission = access.permissionLabel;
    } else if (
      await hasRevokedShareAccessForItem(userId, req.user?.email || '', req.params.id)
    ) {
      res.status(403).json({
        success: false,
        code: ACCESS_REVOKED_ERROR.code,
        message: ACCESS_REVOKED_ERROR.message,
      });
      return;
    }
  }
  if (!item) {
    res.status(404).json({ success: false, message: 'Item not found' });
    return;
  }
  res.status(200).json({
    success: true,
    source: sendSource(req),
    ...(sharedPermission ? { sharedPermission, shared: true } : {}),
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
  const authEntryId =
    req.body?.authenticatorEntryId != null
      ? String(req.body.authenticatorEntryId).trim()
      : '';
  const mfaRaw = req.body?.mfaSecret ?? req.body?.mfa_secret;
  const willCreateAuthenticator =
    !authEntryId &&
    mfaRaw != null &&
    String(mfaRaw).trim() !== '' &&
    String(mfaRaw).trim() !== 'null';
  const allowed = await assertCanCreateVaultItem(userId, category, {
    consumeAuthenticatorSlot: willCreateAuthenticator,
  });
  if (!allowed.ok && 'message' in allowed) {
    res.status(403).json({
      success: false,
      code: allowed.code || 'NOVASAFE_SUBSCRIPTION_REQUIRED',
      message: allowed.message,
      subscription: allowed.state,
    });
    return;
  }
  try {
    const item = await createItem(userId, req.body);
    const linkError =
      item && typeof item === 'object' && 'authenticatorLinkError' in item
        ? String((item as { authenticatorLinkError?: unknown }).authenticatorLinkError || '')
        : '';
    const linkCode =
      item && typeof item === 'object' && 'authenticatorLinkCode' in item
        ? String((item as { authenticatorLinkCode?: unknown }).authenticatorLinkCode || '')
        : '';
    res.status(201).json({
      success: true,
      source: sendSource(req),
      data: toMobileItemDetail(item as Record<string, unknown>),
      ...(linkError
        ? {
            warning: {
              code: linkCode || 'AUTHENTICATOR_LINK_FAILED',
              message: linkError,
            },
          }
        : {}),
    });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json(err.toJSON());
      return;
    }
    throw err;
  }
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
  const actorWrite = await assertCanModifyVault(userId);
  if (actorWrite.ok === false) {
    res.status(403).json({
      success: false,
      code: actorWrite.code || 'NOVASAFE_SUBSCRIPTION_READ_ONLY',
      message: actorWrite.message,
      subscription: actorWrite.state,
    });
    return;
  }
  let item = await updateItemById(userId, req.params.id, req.body || {});
  if (!item) {
    const access = await findShareAccessForItem(
      userId,
      req.user?.email || '',
      req.params.id,
      'edit',
    );
    if (access?.ownerUserId) {
      const ownerWrite = await assertCanModifyVault(access.ownerUserId);
      if (ownerWrite.ok === false) {
        res.status(403).json({
          success: false,
          code: ownerWrite.code || 'NOVASAFE_SUBSCRIPTION_READ_ONLY',
          message: ownerWrite.message,
          subscription: ownerWrite.state,
        });
        return;
      }
      item = await updateItemById(access.ownerUserId, req.params.id, req.body || {});
    } else if (
      await hasRevokedShareAccessForItem(userId, req.user?.email || '', req.params.id)
    ) {
      res.status(403).json({
        success: false,
        code: ACCESS_REVOKED_ERROR.code,
        message: ACCESS_REVOKED_ERROR.message,
      });
      return;
    }
  }
  if (!item) {
    res.status(404).json({ success: false, message: 'Item not found' });
    return;
  }
  const linkError =
    item && typeof item === 'object' && 'authenticatorLinkError' in item
      ? String((item as { authenticatorLinkError?: unknown }).authenticatorLinkError || '')
      : '';
  const linkCode =
    item && typeof item === 'object' && 'authenticatorLinkCode' in item
      ? String((item as { authenticatorLinkCode?: unknown }).authenticatorLinkCode || '')
      : '';
  res.status(200).json({
    success: true,
    source: sendSource(req),
    data: toMobileItemDetail(item as Record<string, unknown>),
    ...(linkError
      ? {
          warning: {
            code: linkCode || 'AUTHENTICATOR_LINK_FAILED',
            message: linkError,
          },
        }
      : {}),
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

export const moveVaultItemFolder = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid item id' });
    return;
  }
  const result = await moveItemToFolder(userId, req.params.id, {
    folderId: req.body?.folderId,
    newFolderId: req.body?.newFolderId,
    oldFolderId: req.body?.oldFolderId,
  });
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Item not found' });
      return;
    }
    if (result.reason === 'FOLDER_NOT_FOUND') {
      res.status(404).json({ success: false, code: 'FOLDER_NOT_FOUND', message: 'Folder not found' });
      return;
    }
    res.status(409).json({
      success: false,
      code: 'FOLDER_MISMATCH',
      message: 'Item is not in the expected folder',
    });
    return;
  }
  res.status(200).json({
    success: true,
    source: sendSource(req),
    message: 'Item moved',
    data: toMobileItemDetail((result.item || {}) as Record<string, unknown>),
  });
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
