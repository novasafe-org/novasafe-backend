import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import {
  createAuthenticatorEntry,
  deleteAuthenticatorEntry,
  getAuthenticatorEntryById,
  linkAuthenticatorToItem,
  listAuthenticatorEntries,
  touchAuthenticatorLastUsed,
  updateAuthenticatorEntry,
} from '../services/authenticator.service';

const requireUserId = (req: Request): string | null => req.user?.id || null;
const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

export const listAuthenticatorEntriesHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const recent = String(req.query.recent || '') === 'true';
  const limit = Number(req.query.limit || (recent ? 10 : 100));
  const data = await listAuthenticatorEntries(userId, { recent, limit, revealSecret: true });
  res.status(200).json({ success: true, source: sendSource(req), data });
};

export const getAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid entry id' });
    return;
  }
  const entry = await getAuthenticatorEntryById(userId, req.params.id, { revealSecret: true });
  if (!entry) {
    res.status(404).json({ success: false, message: 'Authenticator entry not found' });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: entry });
};

export const createAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await createAuthenticatorEntry(userId, {
    secret: req.body?.secret,
    issuer: req.body?.issuer,
    accountName: req.body?.accountName,
    vaultItemId: req.body?.vaultItemId,
    type: req.body?.type,
    hashAlgorithm: req.body?.hashAlgorithm,
    digits: req.body?.digits,
    period: req.body?.period,
    counter: req.body?.counter,
  });
  if (result.ok === false) {
    const { code, message } = result.error;
    const status = code === 'ITEM_ALREADY_LINKED' ? 409 : code === 'INVALID_ITEM' ? 404 : 400;
    res.status(status).json({ success: false, code, message });
    return;
  }
  res.status(201).json({ success: true, source: sendSource(req), data: result.entry });
};

export const updateAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid entry id' });
    return;
  }
  const result = await updateAuthenticatorEntry(userId, req.params.id, {
    secret: req.body?.secret,
    issuer: req.body?.issuer,
    accountName: req.body?.accountName,
    type: req.body?.type,
    hashAlgorithm: req.body?.hashAlgorithm,
    digits: req.body?.digits,
    period: req.body?.period,
    counter: req.body?.counter,
  });
  if (result.ok === false) {
    const { code, message } = result.error;
    res.status(code === 'ENTRY_NOT_FOUND' ? 404 : 400).json({ success: false, code, message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: result.entry });
};

export const deleteAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid entry id' });
    return;
  }
  const result = await deleteAuthenticatorEntry(userId, req.params.id);
  if (result.ok === false) {
    const { code, message } = result.error;
    res.status(code === 'ENTRY_NOT_FOUND' ? 404 : 400).json({ success: false, code, message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req) });
};

export const linkAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid entry id' });
    return;
  }
  const vaultItemId = String(req.body?.vaultItemId || '').trim();
  const result = await linkAuthenticatorToItem(userId, req.params.id, vaultItemId);
  if (result.ok === false) {
    const { code, message } = result.error;
    const status =
      code === 'ENTRY_NOT_FOUND' || code === 'INVALID_ITEM'
        ? 404
        : code === 'ITEM_ALREADY_LINKED' || code === 'ENTRY_ALREADY_LINKED'
          ? 409
          : 400;
    res.status(status).json({ success: false, code, message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: result.entry });
};

export const touchAuthenticatorEntryHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid entry id' });
    return;
  }
  await touchAuthenticatorLastUsed(userId, req.params.id);
  res.status(200).json({ success: true, source: sendSource(req) });
};
