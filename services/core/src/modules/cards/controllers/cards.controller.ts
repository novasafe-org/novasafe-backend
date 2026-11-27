import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import {
  createCard,
  createCardFolder,
  deleteCard,
  deleteCardFolder,
  getCardById,
  listCardFolders,
  listCards,
  updateCard,
} from '../services/cards.service';

const requireUserId = (req: Request): string | null => req.user?.id || null;
const sendSource = (req: Request) => req.source || req.requestContext?.legacySource;

export const listCardsHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const data = await listCards(userId, {
    folderId: req.query.folderId ? String(req.query.folderId) : undefined,
    cardType: req.query.cardType ? String(req.query.cardType) : undefined,
    favoriteOnly: String(req.query.favorite || '') === 'true',
  });
  res.status(200).json({ success: true, source: sendSource(req), data });
};

export const getCardHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid card id' });
    return;
  }
  const card = await getCardById(userId, req.params.id);
  if (!card) {
    res.status(404).json({ success: false, message: 'Card not found' });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: card });
};

export const createCardHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const body = req.body || {};
  const result = await createCard(userId, {
    name: body.name,
    cardType: body.cardType,
    brand: body.brand,
    color: body.color,
    folderId: body.folderId,
    isFavorite: body.isFavorite,
    reminders: body.reminders,
    cardNumber: body.cardNumber ?? body.number,
    cvv: body.cvv,
    holderName: body.holderName ?? body.cardHolderName,
    expiryMonth: body.expiryMonth,
    expiryYear: body.expiryYear,
    billingAddress: body.billingAddress,
    notes: body.notes,
  });
  if (result.ok === false) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }
  res.status(201).json({ success: true, source: sendSource(req), data: result.card });
};

export const updateCardHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid card id' });
    return;
  }
  const body = req.body || {};
  const result = await updateCard(userId, req.params.id, {
    name: body.name,
    cardType: body.cardType,
    brand: body.brand,
    color: body.color,
    folderId: body.folderId,
    isFavorite: body.isFavorite,
    reminders: body.reminders,
    cardNumber: body.cardNumber ?? body.number,
    cvv: body.cvv,
    holderName: body.holderName ?? body.cardHolderName,
    expiryMonth: body.expiryMonth,
    expiryYear: body.expiryYear,
    billingAddress: body.billingAddress,
    notes: body.notes,
  });
  if (result.ok === false) {
    const status = result.message === 'Card not found' ? 404 : 400;
    res.status(status).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req), data: result.card });
};

export const deleteCardHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await deleteCard(userId, req.params.id);
  if (result.ok === false) {
    const status = result.message === 'Card not found' ? 404 : 400;
    res.status(status).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req) });
};

export const listCardFoldersHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const data = await listCardFolders(userId);
  res.status(200).json({ success: true, source: sendSource(req), data });
};

export const createCardFolderHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const body = req.body || {};
  const result = await createCardFolder(userId, {
    name: body.name,
    color: body.color,
    icon: body.icon,
  });
  if (result.ok === false) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }
  res.status(201).json({ success: true, source: sendSource(req), data: result.folder });
};

export const deleteCardFolderHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await deleteCardFolder(userId, req.params.id);
  if (result.ok === false) {
    const status = result.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, source: sendSource(req) });
};
