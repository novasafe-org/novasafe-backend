import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { decryptPayload, decryptText, encryptText } from '../../../shared/crypto/vault-crypto';

const db = getNativeMongo();

/** Cap vault scan when backfilling MFA → authenticatorEntries on list. */
const BACKFILL_VAULT_SCAN_LIMIT = 500;

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const activeFilter = (userId: string, extra: Record<string, unknown> = {}) => ({
  ...userFilter(userId),
  deleted: { $ne: true },
  ...extra,
});

const readVaultMfaSecret = (source: Record<string, unknown> | null | undefined): string | null => {
  if (!source) return null;
  const raw = source.mfaSecret ?? source.mfa_secret;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
};

const bumpVaultDataRevision = async (userId: string): Promise<void> => {
  if (!userId || !ObjectId.isValid(userId)) return;
  try {
    await db.updateOne(
      COLLECTIONS.vaultUsers,
      { _id: new ObjectId(userId) },
      { $inc: { vaultDataRevision: 1 }, $set: { vaultDataRevisionUpdatedAt: new Date() } },
    );
  } catch {
    /* ignore */
  }
};

export type AuthenticatorErrorCode =
  | 'INVALID_ENTRY'
  | 'ENTRY_NOT_FOUND'
  | 'INVALID_SECRET'
  | 'INVALID_ITEM'
  | 'ITEM_ALREADY_LINKED'
  | 'ENTRY_ALREADY_LINKED';

export type AuthenticatorError = { code: AuthenticatorErrorCode; message: string };

export type AuthenticatorEntryResponse = {
  id: string;
  vaultItemId: string | null;
  issuer: string | null;
  accountName: string | null;
  type: 'totp' | 'hotp';
  hashAlgorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
  counter: number | null;
  lastUsedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Revealed only when requested / for owner live codes. */
  secret?: string | null;
  isLinked: boolean;
};

const normalizeHash = (raw: unknown): 'SHA1' | 'SHA256' | 'SHA512' => {
  const v = String(raw || 'SHA1').toUpperCase();
  if (v === 'SHA256' || v === 'SHA512') return v;
  return 'SHA1';
};

const normalizeDigits = (raw: unknown): number => {
  const n = Number(raw);
  return n === 8 ? 8 : 6;
};

const normalizePeriod = (raw: unknown): number => {
  const n = Number(raw);
  if (n === 15 || n === 60) return n;
  return 30;
};

const normalizeSecret = (raw: unknown): string | null => {
  const s = String(raw || '')
    .replace(/[\s\-]+/g, '')
    .toUpperCase()
    .trim();
  if (s.length < 8) return null;
  if (!/^[A-Z2-7]+=*$/.test(s)) return null;
  return s;
};

export const toAuthenticatorResponse = (
  doc: Record<string, unknown>,
  opts?: { revealSecret?: boolean },
): AuthenticatorEntryResponse => {
  const id = String((doc as { _id?: { toString?: () => string } })._id?.toString?.() || doc.id || '');
  const vaultItemId =
    doc.vaultItemId != null ? String((doc.vaultItemId as { toString?: () => string }).toString?.() || doc.vaultItemId) : null;
  const secret = opts?.revealSecret
    ? decryptText({
        encrypted_data: doc.encrypted_data as string | undefined,
        iv: doc.iv as string | undefined,
        authTag: doc.authTag as string | undefined,
      })
    : undefined;

  return {
    id,
    vaultItemId,
    issuer: doc.issuer != null ? String(doc.issuer) : null,
    accountName: doc.accountName != null ? String(doc.accountName) : null,
    type: doc.type === 'hotp' ? 'hotp' : 'totp',
    hashAlgorithm: normalizeHash(doc.hashAlgorithm),
    digits: normalizeDigits(doc.digits),
    period: normalizePeriod(doc.period),
    counter: doc.counter != null ? Number(doc.counter) : null,
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt as string | Date).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : undefined,
    secret: secret ?? null,
    isLinked: Boolean(vaultItemId),
  };
};

export type CreateAuthenticatorInput = {
  secret: string;
  issuer?: string | null;
  accountName?: string | null;
  vaultItemId?: string | null;
  type?: 'totp' | 'hotp';
  hashAlgorithm?: string;
  digits?: number;
  period?: number;
  counter?: number | null;
};

export const getAuthenticatorEntryById = async (
  userId: string,
  id: string,
  opts?: { revealSecret?: boolean },
): Promise<AuthenticatorEntryResponse | null> => {
  if (!ObjectId.isValid(id)) return null;
  const doc = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!doc) return null;
  return toAuthenticatorResponse(doc as Record<string, unknown>, {
    revealSecret: opts?.revealSecret !== false,
  });
};

export const findAuthenticatorByVaultItemId = async (
  userId: string,
  vaultItemId: string,
  opts?: { revealSecret?: boolean },
): Promise<AuthenticatorEntryResponse | null> => {
  if (!ObjectId.isValid(vaultItemId)) return null;
  const doc = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { vaultItemId: new ObjectId(vaultItemId) }),
  );
  if (!doc) return null;
  return toAuthenticatorResponse(doc as Record<string, unknown>, {
    revealSecret: opts?.revealSecret !== false,
  });
};

export const createAuthenticatorEntry = async (
  userId: string,
  input: CreateAuthenticatorInput,
): Promise<{ ok: true; entry: AuthenticatorEntryResponse } | { ok: false; error: AuthenticatorError }> => {
  const secret = normalizeSecret(input.secret);
  if (!secret) {
    return { ok: false, error: { code: 'INVALID_SECRET', message: 'A valid TOTP secret is required' } };
  }

  let vaultItemId: ObjectId | null = null;
  if (input.vaultItemId) {
    if (!ObjectId.isValid(input.vaultItemId)) {
      return { ok: false, error: { code: 'INVALID_ITEM', message: 'Invalid vault item id' } };
    }
    const item = await db.findOne(
      COLLECTIONS.vaultItems,
      activeFilter(userId, { _id: new ObjectId(input.vaultItemId) }),
    );
    if (!item) {
      return { ok: false, error: { code: 'INVALID_ITEM', message: 'Vault item not found' } };
    }
    const existingLink = await db.findOne(
      COLLECTIONS.authenticatorEntries,
      activeFilter(userId, { vaultItemId: new ObjectId(input.vaultItemId) }),
    );
    if (existingLink) {
      return {
        ok: false,
        error: { code: 'ITEM_ALREADY_LINKED', message: 'This vault item already has an authenticator entry' },
      };
    }
    vaultItemId = new ObjectId(input.vaultItemId);
  }

  const enc = encryptText(secret);
  const now = new Date();
  const doc = {
    userId: new ObjectId(userId),
    vaultItemId,
    issuer: input.issuer != null ? String(input.issuer).trim() || null : null,
    accountName: input.accountName != null ? String(input.accountName).trim() || null : null,
    encrypted_data: enc.encrypted_data,
    iv: enc.iv,
    authTag: enc.authTag,
    algorithm: 'aes-256-gcm',
    keyVersion: 1,
    type: input.type === 'hotp' ? 'hotp' : 'totp',
    hashAlgorithm: normalizeHash(input.hashAlgorithm),
    digits: normalizeDigits(input.digits),
    period: normalizePeriod(input.period),
    counter: input.type === 'hotp' ? Number(input.counter ?? 0) : null,
    lastUsedAt: null,
    source: 'mobile',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deleted_at: null,
  };

  const result = await db.insertOne(COLLECTIONS.authenticatorEntries, doc);
  await bumpVaultDataRevision(userId);
  const inserted = await db.findOne(COLLECTIONS.authenticatorEntries, { _id: result.insertedId });
  return {
    ok: true,
    entry: toAuthenticatorResponse(inserted as Record<string, unknown>, { revealSecret: true }),
  };
};

export const updateAuthenticatorEntry = async (
  userId: string,
  id: string,
  input: Partial<CreateAuthenticatorInput> & { lastUsedAt?: Date | null },
): Promise<{ ok: true; entry: AuthenticatorEntryResponse } | { ok: false; error: AuthenticatorError }> => {
  if (!ObjectId.isValid(id)) {
    return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Invalid entry id' } };
  }
  const existing = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!existing) {
    return { ok: false, error: { code: 'ENTRY_NOT_FOUND', message: 'Authenticator entry not found' } };
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.issuer !== undefined) $set.issuer = String(input.issuer || '').trim() || null;
  if (input.accountName !== undefined) $set.accountName = String(input.accountName || '').trim() || null;
  if (input.hashAlgorithm !== undefined) $set.hashAlgorithm = normalizeHash(input.hashAlgorithm);
  if (input.digits !== undefined) $set.digits = normalizeDigits(input.digits);
  if (input.period !== undefined) $set.period = normalizePeriod(input.period);
  if (input.type !== undefined) $set.type = input.type === 'hotp' ? 'hotp' : 'totp';
  if (input.counter !== undefined) $set.counter = input.counter;
  if (input.lastUsedAt !== undefined) $set.lastUsedAt = input.lastUsedAt;

  if (input.secret !== undefined) {
    const secret = normalizeSecret(input.secret);
    if (!secret) {
      return { ok: false, error: { code: 'INVALID_SECRET', message: 'A valid TOTP secret is required' } };
    }
    const enc = encryptText(secret);
    $set.encrypted_data = enc.encrypted_data;
    $set.iv = enc.iv;
    $set.authTag = enc.authTag;
  }

  await db.updateOne(
    COLLECTIONS.authenticatorEntries,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set },
  );
  await bumpVaultDataRevision(userId);
  const updated = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(id) }),
  );
  return {
    ok: true,
    entry: toAuthenticatorResponse(updated as Record<string, unknown>, { revealSecret: true }),
  };
};

export const deleteAuthenticatorEntry = async (
  userId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: AuthenticatorError }> => {
  if (!ObjectId.isValid(id)) {
    return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Invalid entry id' } };
  }
  const existing = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!existing) {
    return { ok: false, error: { code: 'ENTRY_NOT_FOUND', message: 'Authenticator entry not found' } };
  }
  const now = new Date();
  await db.updateOne(
    COLLECTIONS.authenticatorEntries,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set: { deleted: true, deleted_at: now, deletedAt: now, updatedAt: now } },
  );

  // Linked entries: also soft-delete the vault item (and related rows) so 2FA + login stay in sync.
  const linkedRaw = (existing as { vaultItemId?: unknown }).vaultItemId;
  const linkedId =
    linkedRaw == null || linkedRaw === ''
      ? null
      : String((linkedRaw as { toString?: () => string }).toString?.() || linkedRaw);
  if (linkedId && ObjectId.isValid(linkedId)) {
    const itemFilter = {
      $and: [
        { $or: [{ _id: new ObjectId(linkedId) }, { id: linkedId }] },
        userFilter(userId),
        { deleted: { $ne: true } },
      ],
    };
    const itemResult = await db.updateOne(COLLECTIONS.vaultItems, itemFilter, {
      $set: { deleted: true, deleted_at: now, deletedAt: now, source: 'mobile' },
    });
    if (itemResult.matchedCount) {
      await db.getDb().collection(COLLECTIONS.customFields).updateMany(
        { credentialId: new ObjectId(linkedId), ...userFilter(userId), deleted: { $ne: true } },
        { $set: { deleted: true, deletedAt: now, source: 'mobile' } },
      );
      try {
        const { deleteAllAttachmentsForItem } = await import(
          '../../vault/services/item-attachments.service'
        );
        await deleteAllAttachmentsForItem(userId, linkedId);
      } catch {
        // Best-effort NAS/metadata cleanup — item soft-delete already succeeded.
      }
    }
  }

  await bumpVaultDataRevision(userId);
  return { ok: true };
};

/**
 * Link a standalone authenticator entry to a vault item by reference (no secret copy).
 */
export const linkAuthenticatorToItem = async (
  userId: string,
  entryId: string,
  vaultItemId: string,
): Promise<{ ok: true; entry: AuthenticatorEntryResponse } | { ok: false; error: AuthenticatorError }> => {
  if (!ObjectId.isValid(entryId) || !ObjectId.isValid(vaultItemId)) {
    return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Invalid entry or item id' } };
  }
  const entry = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(entryId) }),
  );
  if (!entry) {
    return { ok: false, error: { code: 'ENTRY_NOT_FOUND', message: 'Authenticator entry not found' } };
  }
  if ((entry as { vaultItemId?: unknown }).vaultItemId) {
    return {
      ok: false,
      error: { code: 'ENTRY_ALREADY_LINKED', message: 'This authenticator entry is already linked to an item' },
    };
  }
  const item = await db.findOne(
    COLLECTIONS.vaultItems,
    activeFilter(userId, { _id: new ObjectId(vaultItemId) }),
  );
  if (!item) {
    return { ok: false, error: { code: 'INVALID_ITEM', message: 'Vault item not found' } };
  }
  const existingLink = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { vaultItemId: new ObjectId(vaultItemId) }),
  );
  if (existingLink) {
    return {
      ok: false,
      error: { code: 'ITEM_ALREADY_LINKED', message: 'This vault item already has an authenticator entry' },
    };
  }

  await db.updateOne(
    COLLECTIONS.authenticatorEntries,
    { _id: new ObjectId(entryId), ...userFilter(userId) },
    { $set: { vaultItemId: new ObjectId(vaultItemId), updatedAt: new Date() } },
  );
  await bumpVaultDataRevision(userId);
  const updated = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(entryId) }),
  );
  return {
    ok: true,
    entry: toAuthenticatorResponse(updated as Record<string, unknown>, { revealSecret: true }),
  };
};

/**
 * When a vault item is created/updated with a new MFA secret (no existing entry id),
 * upsert a linked authenticator entry. Prefer linking an existing entry when
 * `authenticatorEntryId` is provided (no secret duplication).
 */
export const syncAuthenticatorForVaultItem = async (
  userId: string,
  vaultItemId: string,
  opts: {
    mfaSecret?: string | null;
    authenticatorEntryId?: string | null;
    issuer?: string | null;
    accountName?: string | null;
  },
): Promise<void> => {
  if (!ObjectId.isValid(vaultItemId)) return;

  const entryId = opts.authenticatorEntryId?.trim();
  if (entryId) {
    await linkAuthenticatorToItem(userId, entryId, vaultItemId);
    return;
  }

  const secret = normalizeSecret(opts.mfaSecret);
  if (!secret) return;

  const existing = await db.findOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { vaultItemId: new ObjectId(vaultItemId) }),
  );

  if (existing) {
    const enc = encryptText(secret);
    await db.updateOne(
      COLLECTIONS.authenticatorEntries,
      { _id: (existing as { _id: ObjectId })._id, ...userFilter(userId) },
      {
        $set: {
          encrypted_data: enc.encrypted_data,
          iv: enc.iv,
          authTag: enc.authTag,
          issuer:
            opts.issuer !== undefined
              ? String(opts.issuer || '').trim() || null
              : (existing as { issuer?: string | null }).issuer ?? null,
          accountName:
            opts.accountName !== undefined
              ? String(opts.accountName || '').trim() || null
              : (existing as { accountName?: string | null }).accountName ?? null,
          updatedAt: new Date(),
        },
      },
    );
    await bumpVaultDataRevision(userId);
    return;
  }

  await createAuthenticatorEntry(userId, {
    secret,
    vaultItemId,
    issuer: opts.issuer,
    accountName: opts.accountName,
  });
};

/**
 * Legacy vault items stored TOTP as encrypted `mfaSecret` on the item blob.
 * Authenticator screen only reads `authenticatorEntries` — backfill linked rows
 * for any item secret that does not already have an entry (standalone stay as-is;
 * linked rows are created so item 2FA shows on the authenticator list).
 */
export const backfillAuthenticatorEntriesFromVaultMfa = async (userId: string): Promise<number> => {
  if (!userId || !ObjectId.isValid(userId)) return 0;

  const [items, existingLinks] = await Promise.all([
    db.findMany(COLLECTIONS.vaultItems, activeFilter(userId), {
      limit: BACKFILL_VAULT_SCAN_LIMIT,
      sort: { updatedAt: -1 },
    }),
    db.findMany(
      COLLECTIONS.authenticatorEntries,
      { ...activeFilter(userId), vaultItemId: { $ne: null } },
      { limit: BACKFILL_VAULT_SCAN_LIMIT },
    ),
  ]);

  const linkedItemIds = new Set(
    existingLinks
      .map((doc) => {
        const vaultItemId = (doc as { vaultItemId?: { toString?: () => string } | string | null })
          .vaultItemId;
        if (vaultItemId == null) return '';
        return String(
          (vaultItemId as { toString?: () => string }).toString?.() || vaultItemId,
        );
      })
      .filter(Boolean),
  );

  let created = 0;
  for (const item of items) {
    const itemId = String((item as { _id?: { toString?: () => string } })._id?.toString?.() || '');
    if (!itemId || linkedItemIds.has(itemId)) continue;

    const decrypted = decryptPayload(item as Parameters<typeof decryptPayload>[0]) || {};
    const mfaSecret = readVaultMfaSecret(decrypted as Record<string, unknown>);
    if (!mfaSecret) continue;

    try {
      await syncAuthenticatorForVaultItem(userId, itemId, {
        mfaSecret,
        issuer: (decrypted as { issuer?: string }).issuer ?? null,
        accountName:
          (decrypted as { accountName?: string; title?: string }).accountName ??
          (decrypted as { title?: string }).title ??
          (item as { title?: string }).title ??
          null,
      });
      linkedItemIds.add(itemId);
      created += 1;
    } catch {
      /* skip bad/legacy secrets — do not fail the list */
    }
  }

  return created;
};

export const listAuthenticatorEntries = async (
  userId: string,
  opts?: { recent?: boolean; limit?: number; revealSecret?: boolean },
): Promise<AuthenticatorEntryResponse[]> => {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const sort: Record<string, 1 | -1> = opts?.recent
    ? { lastUsedAt: -1, updatedAt: -1 }
    : { updatedAt: -1 };

  // Ensure item-linked 2FA secrets appear alongside standalone authenticator apps.
  try {
    await backfillAuthenticatorEntriesFromVaultMfa(userId);
  } catch {
    /* non-fatal */
  }

  const rows = await db.findMany(COLLECTIONS.authenticatorEntries, activeFilter(userId), {
    sort,
    limit,
  });
  return rows.map((r) =>
    toAuthenticatorResponse(r as Record<string, unknown>, { revealSecret: opts?.revealSecret !== false }),
  );
};

export const touchAuthenticatorLastUsed = async (userId: string, id: string): Promise<void> => {
  if (!ObjectId.isValid(id)) return;
  await db.updateOne(
    COLLECTIONS.authenticatorEntries,
    activeFilter(userId, { _id: new ObjectId(id) }),
    { $set: { lastUsedAt: new Date(), updatedAt: new Date() } },
  );
};
