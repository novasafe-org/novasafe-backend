import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { decryptPayload, encryptPayload } from '../../../shared/crypto/vault-crypto';
import { CARD_TYPES, type CardType } from '../../../database/schemas/cards';

const db = getNativeMongo();

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const activeFilter = (userId: string, extra: Record<string, unknown> = {}) => ({
  ...userFilter(userId),
  deleted: { $ne: true },
  ...extra,
});

export type CardSensitivePlain = {
  cardNumber?: string | null;
  cvv?: string | null;
  holderName?: string | null;
  expiryMonth?: string | null;
  expiryYear?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
};

export type CardReminders = {
  paymentDue?: boolean;
  dueDate?: string | null;
  annualFee?: boolean;
  cardExpiry?: boolean;
};

export type CardResponse = {
  id: string;
  name: string;
  cardType: CardType;
  brand: string | null;
  last4: string | null;
  folderId: string | null;
  isFavorite: boolean;
  reminders: CardReminders;
  holderName: string | null;
  cardNumber: string | null;
  expiryMonth: string | null;
  expiryYear: string | null;
  cvv: string | null;
  billingAddress: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CardFolderResponse = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  cardCount: number;
  createdAt?: string;
  updatedAt?: string;
};

const digitsOnly = (raw: unknown): string => String(raw ?? '').replace(/\D/g, '');

const normalizeCardType = (raw: unknown): CardType => {
  const v = String(raw || 'credit').toLowerCase().trim();
  return (CARD_TYPES as readonly string[]).includes(v) ? (v as CardType) : 'other';
};

const detectBrand = (pan: string): string | null => {
  if (!pan) return null;
  if (/^4/.test(pan)) return 'Visa';
  if (/^5[1-5]/.test(pan) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(pan)) return 'Mastercard';
  if (/^3[47]/.test(pan)) return 'Amex';
  if (/^6(011|5)/.test(pan)) return 'Discover';
  if (/^60|^65|^81|^82/.test(pan)) return 'RuPay';
  return null;
};

const toIso = (v: unknown): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v as string | Date);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

export const toCardResponse = (
  doc: Record<string, unknown>,
  opts?: { revealSensitive?: boolean },
): CardResponse => {
  const reveal = opts?.revealSensitive !== false;
  const plain = (reveal ? decryptPayload(doc as never) : null) || {};
  const folderRaw = doc.folderId as { toString?: () => string } | string | null | undefined;
  const folderId =
    folderRaw == null || folderRaw === ''
      ? null
      : String((folderRaw as { toString?: () => string }).toString?.() || folderRaw);
  const reminders = (doc.reminders as CardReminders) || {};

  return {
    id: String((doc as { _id?: { toString?: () => string } })._id?.toString?.() || doc.id || ''),
    name: String(doc.name || 'Card'),
    cardType: normalizeCardType(doc.cardType),
    brand: doc.brand != null ? String(doc.brand) : null,
    last4: doc.last4 != null ? String(doc.last4) : null,
    folderId,
    isFavorite: Boolean(doc.isFavorite),
    reminders: {
      paymentDue: Boolean(reminders.paymentDue),
      dueDate: reminders.dueDate != null ? String(reminders.dueDate) : null,
      annualFee: Boolean(reminders.annualFee),
      cardExpiry: Boolean(reminders.cardExpiry),
    },
    holderName: reveal ? (plain.holderName != null ? String(plain.holderName) : null) : null,
    cardNumber: reveal ? (plain.cardNumber != null ? String(plain.cardNumber) : null) : null,
    expiryMonth: reveal ? (plain.expiryMonth != null ? String(plain.expiryMonth) : null) : null,
    expiryYear: reveal ? (plain.expiryYear != null ? String(plain.expiryYear) : null) : null,
    cvv: reveal ? (plain.cvv != null ? String(plain.cvv) : null) : null,
    billingAddress: reveal
      ? plain.billingAddress != null
        ? String(plain.billingAddress)
        : null
      : null,
    notes: reveal ? (plain.notes != null ? String(plain.notes) : null) : null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
};

export const assertCardFolderOwned = async (
  userId: string,
  folderId: string | null | undefined,
): Promise<{ ok: true; folderId: ObjectId | null } | { ok: false; message: string }> => {
  if (folderId == null || folderId === '') return { ok: true, folderId: null };
  if (!ObjectId.isValid(folderId)) return { ok: false, message: 'Invalid folder id' };
  const folder = await db.findOne(
    COLLECTIONS.cardFolders,
    activeFilter(userId, { _id: new ObjectId(folderId) }),
  );
  if (!folder) return { ok: false, message: 'Card folder not found' };
  return { ok: true, folderId: new ObjectId(folderId) };
};

export const listCards = async (
  userId: string,
  opts?: { folderId?: string; cardType?: string; favoriteOnly?: boolean },
): Promise<CardResponse[]> => {
  const filter: Record<string, unknown> = { ...activeFilter(userId) };
  if (opts?.folderId && ObjectId.isValid(opts.folderId)) {
    filter.folderId = new ObjectId(opts.folderId);
  }
  if (opts?.cardType && opts.cardType !== 'all') {
    filter.cardType = normalizeCardType(opts.cardType);
  }
  if (opts?.favoriteOnly) filter.isFavorite = true;

  const rows = await db.findMany(COLLECTIONS.cards, filter, {
    sort: { isFavorite: -1, updatedAt: -1 },
    limit: 500,
  });
  return rows.map((r) => toCardResponse(r as Record<string, unknown>, { revealSensitive: true }));
};

export const getCardById = async (userId: string, id: string): Promise<CardResponse | null> => {
  if (!ObjectId.isValid(id)) return null;
  const doc = await db.findOne(COLLECTIONS.cards, activeFilter(userId, { _id: new ObjectId(id) }));
  if (!doc) return null;
  return toCardResponse(doc as Record<string, unknown>, { revealSensitive: true });
};

/** Used by share module to verify ownership. */
export const loadOwnedCard = async (userId: string, resourceId: string) => {
  if (!ObjectId.isValid(resourceId)) return null;
  return db.findOne(COLLECTIONS.cards, activeFilter(userId, { _id: new ObjectId(resourceId) }));
};

export type CreateCardInput = {
  name: string;
  cardType?: string;
  brand?: string | null;
  folderId?: string | null;
  isFavorite?: boolean;
  reminders?: CardReminders;
  cardNumber?: string | null;
  cvv?: string | null;
  holderName?: string | null;
  expiryMonth?: string | null;
  expiryYear?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
};

export const createCard = async (
  userId: string,
  input: CreateCardInput,
): Promise<{ ok: true; card: CardResponse } | { ok: false; message: string }> => {
  const name = String(input.name || '').trim();
  if (!name) return { ok: false, message: 'Card name is required' };

  const folderCheck = await assertCardFolderOwned(userId, input.folderId);
  if (folderCheck.ok === false) return folderCheck;

  const pan = digitsOnly(input.cardNumber);
  const sensitive: CardSensitivePlain = {
    cardNumber: pan || null,
    cvv: input.cvv != null ? String(input.cvv).trim() || null : null,
    holderName: input.holderName != null ? String(input.holderName).trim() || null : null,
    expiryMonth: input.expiryMonth != null ? String(input.expiryMonth).trim() || null : null,
    expiryYear: input.expiryYear != null ? String(input.expiryYear).trim() || null : null,
    billingAddress: input.billingAddress != null ? String(input.billingAddress).trim() || null : null,
    notes: input.notes != null ? String(input.notes).trim() || null : null,
  };
  const enc = encryptPayload(sensitive);
  const now = new Date();
  const doc = {
    userId: new ObjectId(userId),
    name,
    cardType: normalizeCardType(input.cardType),
    brand: input.brand != null ? String(input.brand).trim() || detectBrand(pan) : detectBrand(pan),
    last4: pan.length >= 4 ? pan.slice(-4) : null,
    folderId: folderCheck.folderId,
    isFavorite: Boolean(input.isFavorite),
    reminders: {
      paymentDue: Boolean(input.reminders?.paymentDue),
      dueDate: input.reminders?.dueDate != null ? String(input.reminders.dueDate) : null,
      annualFee: Boolean(input.reminders?.annualFee),
      cardExpiry: Boolean(input.reminders?.cardExpiry),
    },
    encrypted_data: enc.encrypted_data,
    iv: enc.iv,
    authTag: enc.authTag,
    algorithm: 'aes-256-gcm',
    keyVersion: 1,
    source: 'mobile',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deleted_at: null,
  };

  const result = await db.insertOne(COLLECTIONS.cards, doc);
  const inserted = await db.findOne(COLLECTIONS.cards, { _id: result.insertedId });
  return { ok: true, card: toCardResponse(inserted as Record<string, unknown>) };
};

export const updateCard = async (
  userId: string,
  id: string,
  input: Partial<CreateCardInput>,
): Promise<{ ok: true; card: CardResponse } | { ok: false; message: string }> => {
  if (!ObjectId.isValid(id)) return { ok: false, message: 'Invalid card id' };
  const existing = await db.findOne(COLLECTIONS.cards, activeFilter(userId, { _id: new ObjectId(id) }));
  if (!existing) return { ok: false, message: 'Card not found' };

  const prevPlain = (decryptPayload(existing as never) || {}) as CardSensitivePlain;
  const folderCheck =
    input.folderId !== undefined
      ? await assertCardFolderOwned(userId, input.folderId)
      : { ok: true as const, folderId: (existing as { folderId?: ObjectId | null }).folderId ?? null };
  if (folderCheck.ok === false) return folderCheck;

  const pan =
    input.cardNumber !== undefined ? digitsOnly(input.cardNumber) : digitsOnly(prevPlain.cardNumber);
  const sensitive: CardSensitivePlain = {
    cardNumber: input.cardNumber !== undefined ? pan || null : prevPlain.cardNumber ?? null,
    cvv:
      input.cvv !== undefined
        ? String(input.cvv || '').trim() || null
        : prevPlain.cvv ?? null,
    holderName:
      input.holderName !== undefined
        ? String(input.holderName || '').trim() || null
        : prevPlain.holderName ?? null,
    expiryMonth:
      input.expiryMonth !== undefined
        ? String(input.expiryMonth || '').trim() || null
        : prevPlain.expiryMonth ?? null,
    expiryYear:
      input.expiryYear !== undefined
        ? String(input.expiryYear || '').trim() || null
        : prevPlain.expiryYear ?? null,
    billingAddress:
      input.billingAddress !== undefined
        ? String(input.billingAddress || '').trim() || null
        : prevPlain.billingAddress ?? null,
    notes:
      input.notes !== undefined
        ? String(input.notes || '').trim() || null
        : prevPlain.notes ?? null,
  };
  const enc = encryptPayload(sensitive);
  const $set: Record<string, unknown> = {
    updatedAt: new Date(),
    encrypted_data: enc.encrypted_data,
    iv: enc.iv,
    authTag: enc.authTag,
    last4: pan.length >= 4 ? pan.slice(-4) : (existing as { last4?: string }).last4 ?? null,
    brand:
      input.brand !== undefined
        ? String(input.brand || '').trim() || detectBrand(pan)
        : (existing as { brand?: string }).brand || detectBrand(pan),
  };
  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) return { ok: false, message: 'Card name is required' };
    $set.name = name;
  }
  if (input.cardType !== undefined) $set.cardType = normalizeCardType(input.cardType);
  if (input.folderId !== undefined) $set.folderId = folderCheck.folderId;
  if (input.isFavorite !== undefined) $set.isFavorite = Boolean(input.isFavorite);
  if (input.reminders !== undefined) {
    const prev = ((existing as { reminders?: CardReminders }).reminders || {}) as CardReminders;
    $set.reminders = {
      paymentDue:
        input.reminders.paymentDue !== undefined
          ? Boolean(input.reminders.paymentDue)
          : Boolean(prev.paymentDue),
      dueDate:
        input.reminders.dueDate !== undefined
          ? input.reminders.dueDate
          : prev.dueDate ?? null,
      annualFee:
        input.reminders.annualFee !== undefined
          ? Boolean(input.reminders.annualFee)
          : Boolean(prev.annualFee),
      cardExpiry:
        input.reminders.cardExpiry !== undefined
          ? Boolean(input.reminders.cardExpiry)
          : Boolean(prev.cardExpiry),
    };
  }

  await db.updateOne(COLLECTIONS.cards, { _id: new ObjectId(id), ...userFilter(userId) }, { $set });
  const updated = await db.findOne(COLLECTIONS.cards, activeFilter(userId, { _id: new ObjectId(id) }));
  return { ok: true, card: toCardResponse(updated as Record<string, unknown>) };
};

export const deleteCard = async (
  userId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!ObjectId.isValid(id)) return { ok: false, message: 'Invalid card id' };
  const existing = await db.findOne(COLLECTIONS.cards, activeFilter(userId, { _id: new ObjectId(id) }));
  if (!existing) return { ok: false, message: 'Card not found' };
  const now = new Date();
  await db.updateOne(
    COLLECTIONS.cards,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set: { deleted: true, deleted_at: now, deletedAt: now, updatedAt: now } },
  );
  return { ok: true };
};

export const listCardFolders = async (userId: string): Promise<CardFolderResponse[]> => {
  const folders = await db.findMany(COLLECTIONS.cardFolders, activeFilter(userId), {
    sort: { name: 1 },
    limit: 200,
  });
  const cards = await db.findMany(COLLECTIONS.cards, activeFilter(userId), { limit: 1000 });
  const counts = new Map<string, number>();
  for (const c of cards) {
    const fid = (c as { folderId?: { toString?: () => string } }).folderId?.toString?.();
    if (fid) counts.set(fid, (counts.get(fid) || 0) + 1);
  }
  return folders.map((f) => {
    const id = String((f as { _id?: { toString?: () => string } })._id?.toString?.() || '');
    return {
      id,
      name: String((f as { name?: string }).name || 'Folder'),
      color: (f as { color?: string | null }).color ?? null,
      icon: (f as { icon?: string | null }).icon ?? null,
      cardCount: counts.get(id) || 0,
      createdAt: toIso((f as { createdAt?: unknown }).createdAt),
      updatedAt: toIso((f as { updatedAt?: unknown }).updatedAt),
    };
  });
};

export const createCardFolder = async (
  userId: string,
  input: { name: string; color?: string | null; icon?: string | null },
): Promise<{ ok: true; folder: CardFolderResponse } | { ok: false; message: string }> => {
  const name = String(input.name || '').trim();
  if (!name) return { ok: false, message: 'Folder name is required' };
  const now = new Date();
  const doc = {
    userId: new ObjectId(userId),
    name,
    color: input.color != null ? String(input.color) : null,
    icon: input.icon != null ? String(input.icon) : null,
    source: 'mobile',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deleted_at: null,
  };
  const result = await db.insertOne(COLLECTIONS.cardFolders, doc);
  return {
    ok: true,
    folder: {
      id: String(result.insertedId),
      name,
      color: doc.color,
      icon: doc.icon,
      cardCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
};

export const deleteCardFolder = async (
  userId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!ObjectId.isValid(id)) return { ok: false, message: 'Invalid folder id' };
  const folder = await db.findOne(
    COLLECTIONS.cardFolders,
    activeFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!folder) return { ok: false, message: 'Card folder not found' };
  const remaining = await db.findOne(
    COLLECTIONS.cards,
    activeFilter(userId, { folderId: new ObjectId(id) }),
  );
  if (remaining) return { ok: false, message: 'Move or delete cards in this folder first' };
  const now = new Date();
  await db.updateOne(
    COLLECTIONS.cardFolders,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set: { deleted: true, deleted_at: now, deletedAt: now, updatedAt: now } },
  );
  return { ok: true };
};
