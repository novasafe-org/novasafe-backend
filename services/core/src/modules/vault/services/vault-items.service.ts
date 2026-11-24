import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { decryptPayload, decryptText, encryptPayload, encryptText } from '../../../shared/crypto';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import {
  redactPasswordVersionsForEntitlement,
  userCanAccessPasswordHistory,
  type PasswordVersionRecord,
} from '../utils/password-version-access';
import {
  assertCanCreateVaultItem,
  assertCanModifyVault,
} from '../../subscriptions/services/subscription.service';
import { assertFolderOwned } from '../../folders/services/folders.service';
import {
  findAuthenticatorByVaultItemId,
  syncAuthenticatorForVaultItem,
} from '../../authenticator';
import { AppError } from '../../../shared/errors';

const collection = COLLECTIONS;
const db = getNativeMongo();

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

/** Bump so other sessions can poll `/revision` instead of maintaining a websocket. */
export const bumpVaultDataRevision = async (userId: string): Promise<void> => {
  if (!userId || !ObjectId.isValid(userId)) return;
  try {
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(userId) },
      { $inc: { vaultDataRevision: 1 }, $set: { vaultDataRevisionUpdatedAt: new Date() } },
    );
  } catch {
    /* ignore */
  }
};

export const getVaultDataRevisionForUser = async (userId: string): Promise<number> => {
  if (!userId || !ObjectId.isValid(userId)) return 0;
  const doc = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) });
  return Number((doc as any)?.vaultDataRevision) || 0;
};

const CUSTOM_FIELD_TYPES = new Set([
  'TEXT', 'PASSWORD', 'PIN', 'OTP', 'TOTP', 'SECURITY_QUESTION',
  'EMAIL', 'PHONE', 'USERNAME', 'URL', 'ADDRESS',
  'CARD_NUMBER', 'CARD_HOLDER_NAME', 'EXPIRY_DATE', 'CVV', 'UPI_ID', 'BANK_ACCOUNT_NUMBER', 'IFSC_CODE',
  'COMPANY_NAME', 'EMPLOYEE_ID', 'LICENSE_NUMBER', 'PASSPORT_NUMBER', 'AADHAR_NUMBER', 'PAN_NUMBER',
  'NOTE', 'DATE', 'NUMBER', 'FILE',
  'SELECT', 'BOOLEAN', 'TAGS',
]);

const SENSITIVE_FIELD_TYPES = new Set(['PASSWORD', 'PIN', 'OTP', 'TOTP', 'CVV', 'CARD_NUMBER', 'BANK_ACCOUNT_NUMBER', 'PASSPORT_NUMBER', 'AADHAR_NUMBER', 'PAN_NUMBER', 'SECURITY_QUESTION']);

const maskValue = (value: string, fieldType: string) => {
  if (!value) return '';
  if (fieldType === 'CARD_NUMBER') return `**** **** **** ${value.slice(-4)}`;
  if (fieldType === 'EMAIL') {
    const [name, domain] = value.split('@');
    if (!domain) return '••••';
    return `${(name || '').slice(0, 2)}•••@${domain}`;
  }
  return '•'.repeat(Math.min(Math.max(value.length, 4), 18));
};

const parseFieldType = (fieldType: string) => {
  let normalized = String(fieldType || 'TEXT').toUpperCase().trim();
  // Flutter UI "Secret" / aliases → allowed sensitive types.
  if (normalized === 'SECRET') normalized = 'PASSWORD';
  if (normalized === 'MULTILINE') normalized = 'NOTE';
  if (!CUSTOM_FIELD_TYPES.has(normalized)) return null;
  return normalized;
};

/** Expire every active password version (explicit clear / empty password on save). */
const clearActivePasswordVersions = async (userId: string, credentialId: ObjectId) => {
  const now = new Date();
  await db.getDb().collection(collection.passwordVersions).updateMany(
    {
      credentialId,
      ...userFilter(userId),
      deleted: { $ne: true },
      is_expired: { $ne: true },
    },
    { $set: { is_expired: true, updatedAt: now, source: 'mobile' } },
  );
};

const applyPasswordFromPayload = async (
  userId: string,
  credentialId: ObjectId,
  payload: any,
) => {
  // Only act when the client explicitly sends `password` (including empty string).
  if (payload == null || !Object.prototype.hasOwnProperty.call(payload, 'password')) {
    return;
  }
  if (payload.password === null || payload.password === undefined) {
    return;
  }
  const next = String(payload.password);
  if (next.length > 0) {
    await createPasswordVersion(userId, credentialId, next);
  } else {
    await clearActivePasswordVersions(userId, credentialId);
  }
};

const readMfaSecret = (source: any): string | null | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  if (source.mfaSecret !== undefined) return source.mfaSecret;
  if (source.mfa_secret !== undefined) return source.mfa_secret;
  return undefined;
};

const normalizeCredentialPayload = (payload: any, existing?: any) => {
  const incomingMfa = readMfaSecret(payload);
  const existingMfa = readMfaSecret(existing);
  return {
    title: payload.title ?? existing?.title,
    username: payload.username ?? existing?.username,
    url: payload.url ?? existing?.url,
    notes: payload.notes ?? existing?.notes,
    cardNumber: payload.cardNumber ?? existing?.cardNumber,
    apiKey: payload.apiKey ?? existing?.apiKey,
    // Encrypted TOTP secret for login MFA (same payload encryption as other credential fields).
    // Always persist into the encrypted blob so update/create keep 2FA across reloads.
    mfaSecret:
      incomingMfa !== undefined
        ? String(incomingMfa || '').trim() || null
        : existingMfa !== undefined
          ? String(existingMfa || '').trim() || null
          : null,
    type: payload.type ?? existing?.type ?? 'login',
    category: payload.category ?? existing?.category ?? 'login',
  };
};

const normalizeTags = (tags: any): string[] => {
  if (!Array.isArray(tags)) return [];
  const values = tags
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 20);
  return Array.from(new Set(values));
};

const extractDomain = (url?: string) => {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const slugify = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const deriveLogoUrl = (url?: string, title?: string): string | null => {
  const fromUrl = extractDomain(url);
  if (fromUrl) return `https://logo.clearbit.com/${fromUrl}`;
  const titleSlug = slugify(title);
  if (!titleSlug) return null;
  const commonMap: Record<string, string> = {
    gmail: 'gmail.com',
    google: 'google.com',
    facebook: 'facebook.com',
    instagram: 'instagram.com',
    whatsapp: 'whatsapp.com',
    linkedin: 'linkedin.com',
    twitter: 'x.com',
    x: 'x.com',
    amazon: 'amazon.com',
    youtube: 'youtube.com',
    netflix: 'netflix.com',
  };
  const matched = Object.keys(commonMap).find((k) => titleSlug.includes(k));
  return matched ? `https://logo.clearbit.com/${commonMap[matched]}` : null;
};

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'admin', 'admin123', 'qwerty', 'qwerty123',
  'welcome', 'welcome123', 'letmein', 'iloveyou', 'abc123', '123456',
  '12345678', '123456789', '000000', '111111', 'passw0rd',
]);

const normalizeLeet = (value: string) =>
  value
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b');

const hasSequentialPattern = (value: string) => {
  const lower = value.toLowerCase();
  const sequences = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '0123456789'];
  return sequences.some((seq) => {
    for (let i = 0; i <= seq.length - 4; i++) {
      const chunk = seq.slice(i, i + 4);
      const reverse = chunk.split('').reverse().join('');
      if (lower.includes(chunk) || lower.includes(reverse)) return true;
    }
    return false;
  });
};

const hasRepeatingPattern = (value: string) => /(.)\1{2,}/.test(value) || /^(.{1,3})\1+$/.test(value);

const getPasswordStrength = (password?: string): 'weak' | 'medium' | 'strong' => {
  const value = String(password || '');
  if (!value) return 'medium';
  if (value.length < 8) return 'weak';

  const normalized = normalizeLeet(value);
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(compact)) return 'weak';
  if (hasSequentialPattern(value) || hasRepeatingPattern(compact)) return 'weak';

  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (new Set(value).size >= Math.min(8, value.length)) score++;

  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
};

const getPasswordVersions = async (userId: string, credentialId: ObjectId): Promise<PasswordVersionRecord[]> => {
  const docs = await db.findMany(collection.passwordVersions, {
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
  }, { sort: { createdAt: -1 }, limit: 100 });
  return docs.map((v: any) => ({
    id: v._id?.toString?.(),
    credential_id: v.credentialId?.toString?.(),
    password: decryptText(v) || '',
    is_expired: Boolean(v.is_expired),
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  }));
};

const resolvePasswordVersionsForResponse = async (
  userId: string,
  credentialId: ObjectId,
): Promise<PasswordVersionRecord[]> => {
  const versions = await getPasswordVersions(userId, credentialId);
  const canAccess = await userCanAccessPasswordHistory(userId);
  return redactPasswordVersionsForEntitlement(versions, canAccess);
};

const getActivePasswordVersion = async (userId: string, credentialId: ObjectId) => {
  const doc = await db.findOne(collection.passwordVersions, {
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
    is_expired: { $ne: true },
  });
  if (!doc) return null;
  return {
    id: doc._id?.toString?.(),
    credential_id: doc.credentialId?.toString?.(),
    password: decryptText(doc as any) || '',
    is_expired: false,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
};

const createPasswordVersion = async (userId: string, credentialId: ObjectId, password: string) => {
  const now = new Date();
  await db.getDb().collection(collection.passwordVersions).updateMany(
    {
      credentialId,
      ...userFilter(userId),
      deleted: { $ne: true },
      is_expired: { $ne: true },
    },
    { $set: { is_expired: true, updatedAt: now, source: 'mobile' } },
  );
  const enc = encryptText(password);
  await db.insertOne(collection.passwordVersions, {
    userId: new ObjectId(userId),
    credentialId,
    encrypted_data: enc.encrypted_data,
    iv: enc.iv,
    authTag: enc.authTag,
    is_expired: false,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    source: 'mobile',
  });
};

const serializeCustomField = (doc: any, revealSensitive = false) => {
  const value = doc?.is_sensitive ? (decryptText(doc as any) || '') : String(doc?.field_value || '');
  return {
    id: doc?._id?.toString?.(),
    credential_id: doc?.credentialId?.toString?.(),
    field_label: doc?.field_label,
    field_type: doc?.field_type,
    is_sensitive: Boolean(doc?.is_sensitive),
    field_value: doc?.is_sensitive && !revealSensitive ? maskValue(value, String(doc?.field_type || 'TEXT')) : value,
    created_at: doc?.createdAt,
    updated_at: doc?.updatedAt,
  };
};

const getCustomFields = async (userId: string, credentialId: ObjectId, revealSensitive = false) => {
  const docs = await db.findMany(collection.customFields, {
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
  }, { sort: { createdAt: -1 }, limit: 200 });
  return docs.map((doc: any) => serializeCustomField(doc, revealSensitive));
};

const normalizeIncomingCustomFields = (payload: any): Array<{
  field_label: string;
  field_type: string;
  field_value: string;
  is_sensitive?: boolean;
}> => {
  const raw = Array.isArray(payload?.custom_fields)
    ? payload.custom_fields
    : Array.isArray(payload?.customFields)
      ? payload.customFields.map((field: any) => ({
          field_label: field?.field_label || field?.label || field?.key,
          field_type: field?.field_type || field?.type || 'TEXT',
          field_value: field?.field_value || field?.value || '',
          is_sensitive: field?.is_sensitive,
        }))
      : [];

  return raw
    .map((field: any) => ({
      field_label: String(field?.field_label || '').trim(),
      field_type: String(field?.field_type || 'TEXT'),
      field_value: String(field?.field_value ?? ''),
      is_sensitive: field?.is_sensitive === true,
    }))
    .filter((field) => field.field_label);
};

const replaceCredentialCustomFields = async (
  userId: string,
  credentialId: ObjectId,
  fields: Array<{ field_label: string; field_type: string; field_value: string; is_sensitive?: boolean }>,
) => {
  await db.getDb().collection(collection.customFields).updateMany(
    { credentialId, ...userFilter(userId), deleted: { $ne: true } },
    { $set: { deleted: true, deletedAt: new Date(), source: 'mobile' } },
  );

  for (const customField of fields) {
    const fieldType = parseFieldType(customField.field_type);
    const label = String(customField.field_label || '').trim();
    if (!fieldType || !label) continue;
    const rawValue = String(customField.field_value ?? '');
    const isSensitive = customField.is_sensitive === true || SENSITIVE_FIELD_TYPES.has(fieldType);
    const nowField = new Date();
    let toInsert: any = {
      userId: new ObjectId(userId),
      credentialId,
      field_label: label,
      field_type: fieldType,
      is_sensitive: isSensitive,
      createdAt: nowField,
      updatedAt: nowField,
      deleted: false,
      source: 'mobile',
    };
    if (isSensitive) {
      const encrypted = encryptText(rawValue);
      toInsert = { ...toInsert, encrypted_data: encrypted.encrypted_data, iv: encrypted.iv, authTag: encrypted.authTag };
    } else {
      toInsert.field_value = rawValue;
    }
    await db.insertOne(collection.customFields, toInsert);
  }
};

export type ListItemsOptions = {
  folderId?: string | null;
  /** When true, only items with no folder. */
  unfiled?: boolean;
};

export const listItems = async (
  userId: string,
  page: number,
  limit: number,
  options: ListItemsOptions = {},
) => {
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = {
    ...userFilter(userId),
    deleted: { $ne: true },
    deleted_at: null,
  };

  if (options.unfiled) {
    query.$and = [
      ...(Array.isArray(query.$and) ? (query.$and as object[]) : []),
      { $or: [{ folderId: null }, { folderId: { $exists: false } }] },
    ];
  } else if (options.folderId) {
    if (ObjectId.isValid(options.folderId)) {
      query.folderId = new ObjectId(options.folderId);
    }
  }

  const [items, total, authLinks] = await Promise.all([
    db.findMany(collection.vaultItems, query, { skip, limit, sort: { updatedAt: -1 } }),
    db.getDb().collection(collection.vaultItems).countDocuments(query),
    db.findMany(
      collection.authenticatorEntries,
      { ...userFilter(userId), deleted: { $ne: true }, vaultItemId: { $ne: null } },
      { limit: 500 },
    ),
  ]);

  const linkedItemIds = new Set(
    authLinks
      .map((a: any) => a.vaultItemId?.toString?.() || String(a.vaultItemId || ''))
      .filter(Boolean),
  );

  const itemsWithDecrypted = await Promise.all(items.map(async (item: any) => {
    const decrypted = decryptPayload(item as any) || {};
    const activePassword = await getActivePasswordVersion(userId, item._id);
    const password = activePassword?.password;
    const mfaSecret = readMfaSecret(decrypted);
    return {
      ...item,
      ...decrypted,
      password,
      mfaSecret: mfaSecret ? String(mfaSecret) : null,
      hasLinkedAuthenticator: !mfaSecret && linkedItemIds.has(String(item._id)),
      tags: item.tags || [],
      logoUrl: item.logoUrl || null,
      strength: getPasswordStrength(password),
    };
  }));

  return { items: itemsWithDecrypted, total };
};

export const getItemById = async (userId: string, id: string, revealSensitive = false) => {
  const item = await db.findOne(collection.vaultItems, {
    $and: [
      { $or: [{ _id: new ObjectId(id) }, { id }] },
      userFilter(userId),
      { deleted: { $ne: true } },
    ],
  });
  if (!item) return null;
  const decrypted = decryptPayload(item as any) || {};
  const activePassword = await getActivePasswordVersion(userId, item._id);
  const passwordVersions = await resolvePasswordVersionsForResponse(userId, item._id);
  const customFields = await getCustomFields(userId, item._id, revealSensitive);
  let mfaSecret = readMfaSecret(decrypted);
  if (!mfaSecret) {
    const linked = await findAuthenticatorByVaultItemId(userId, String(item._id), {
      revealSecret: true,
    });
    mfaSecret = linked?.secret ?? null;
  }
  return {
    ...item,
    ...decrypted,
    password: revealSensitive ? activePassword?.password : undefined,
    // Always expose decrypted MFA for update merges + mobile detail formatter.
    // (Do not set undefined when !revealSensitive — that wiped secrets on merge.)
    mfaSecret: mfaSecret ? String(mfaSecret) : null,
    tags: item.tags || [],
    logoUrl: item.logoUrl || null,
    password_versions: passwordVersions,
    custom_fields: customFields,
  };
};

export const createItem = async (userId: string, payload: any) => {
  const now = new Date();
  const normalizedPayload = normalizeCredentialPayload(payload);
  const tags = normalizeTags(payload.tags);
  const logoUrl = deriveLogoUrl(normalizedPayload.url, normalizedPayload.title);

  // Link-by-reference: do not duplicate TOTP secret into the item blob.
  const authenticatorEntryIdForCreate =
    payload.authenticatorEntryId != null ? String(payload.authenticatorEntryId).trim() : '';
  if (authenticatorEntryIdForCreate) {
    normalizedPayload.mfaSecret = null;
  }

  // New mfaSecret (not linking an existing entry) consumes a second Free-plan slot.
  const mfaRaw = normalizedPayload.mfaSecret;
  const willCreateAuthenticator =
    !authenticatorEntryIdForCreate &&
    mfaRaw != null &&
    String(mfaRaw).trim() !== '' &&
    String(mfaRaw).trim() !== 'null';
  const slotCheck = await assertCanCreateVaultItem(
    userId,
    String(normalizedPayload.category || payload.category || payload.type || 'login'),
    { consumeAuthenticatorSlot: willCreateAuthenticator },
  );
  if (slotCheck.ok === false) {
    throw new AppError(
      slotCheck.message,
      403,
      slotCheck.code || 'NOVASAFE_SUBSCRIPTION_REQUIRED',
    );
  }

  const encrypted = encryptPayload(normalizedPayload);

  // Optional folderId — omitted/null is allowed (no error). Invalid id is ignored → null.
  let folderId: ObjectId | null = null;
  if (payload.folderId) {
    const folderCheck = await assertFolderOwned(userId, String(payload.folderId));
    folderId = folderCheck.ok ? folderCheck.folderId : null;
  }

  const doc = {
    userId: new ObjectId(userId),
    encrypted_data: encrypted.encrypted_data,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    category: normalizedPayload.category,
    title: normalizedPayload.title,
    folderId,
    tags,
    logoUrl,
    isFavorite: Boolean(payload.isFavorite),
    field_count: payload.field_count || 0,
    attachment_count: payload.attachment_count || 0,
    source: 'mobile',
    sync_status: 'synced',
    synced_at: now,
    local_version: Number(payload.localVersion || 1),
    cloud_version: 1,
    device_id: payload.deviceId || null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deleted_at: null,
    accessCount: 0,
    lastAccessedAt: null,
  };

  const result = await db.insertOne(collection.vaultItems, doc);
  await applyPasswordFromPayload(userId, result.insertedId, payload);
  const incomingCustomFields = normalizeIncomingCustomFields(payload);
  if (incomingCustomFields.length > 0) {
    await replaceCredentialCustomFields(userId, result.insertedId, incomingCustomFields);
  }

  // Authenticator sync: link existing entry by reference, or create linked entry from mfaSecret.
  let authenticatorLinkError: string | null = null;
  let authenticatorLinkCode: string | null = null;
  try {
    const syncResult = await syncAuthenticatorForVaultItem(userId, String(result.insertedId), {
      authenticatorEntryId: authenticatorEntryIdForCreate || null,
      mfaSecret: authenticatorEntryIdForCreate
        ? null
        : (normalizedPayload.mfaSecret as string | null),
      issuer: payload.issuer ?? payload.mfaIssuer ?? null,
      accountName: payload.accountName ?? payload.mfaAccountName ?? normalizedPayload.title ?? null,
    });
    if (syncResult.ok === false) {
      authenticatorLinkError = syncResult.message;
      authenticatorLinkCode = syncResult.code || 'AUTHENTICATOR_LINK_FAILED';
    }
  } catch (err) {
    authenticatorLinkError =
      err instanceof Error ? err.message : 'Authenticator could not be linked to this item.';
    authenticatorLinkCode = 'AUTHENTICATOR_LINK_FAILED';
  }

  const inserted = await db.findOne(collection.vaultItems, { _id: result.insertedId });
  const activePassword = await getActivePasswordVersion(userId, result.insertedId);
  const versions = await resolvePasswordVersionsForResponse(userId, result.insertedId);
  const customFields = await getCustomFields(userId, result.insertedId, true);
  await bumpVaultDataRevision(userId);

  let mfaSecret = normalizedPayload.mfaSecret as string | null;
  if (!mfaSecret) {
    const linked = await findAuthenticatorByVaultItemId(userId, String(result.insertedId), {
      revealSecret: true,
    });
    mfaSecret = linked?.secret ?? null;
  }

  return {
    ...inserted,
    ...normalizedPayload,
    mfaSecret: authenticatorLinkError ? null : mfaSecret,
    tags,
    logoUrl,
    password: activePassword?.password,
    password_versions: versions,
    custom_fields: customFields,
    ...(authenticatorLinkError
      ? {
          authenticatorLinkError,
          authenticatorLinkCode,
        }
      : {}),
  };
};

export const updateItemById = async (userId: string, id: string, payload: any) => {
  const existing: any = await getItemById(userId, id);
  if (!existing) return null;
  const mergedPlain = normalizeCredentialPayload(payload, existing);
  const tags = payload.tags !== undefined ? normalizeTags(payload.tags) : normalizeTags(existing.tags);
  const logoUrl = payload.logoUrl === null ? null : (deriveLogoUrl(mergedPlain.url, mergedPlain.title) || existing.logoUrl || null);
  const encrypted = encryptPayload(mergedPlain);
  const updateData: any = {
    updatedAt: new Date(),
    source: 'mobile',
    sync_status: 'synced',
    synced_at: new Date(),
    local_version: Number(payload.localVersion || existing.local_version || 1),
    cloud_version: Number(existing.cloud_version || 0) + 1,
    device_id: payload.deviceId || existing.device_id || null,
    encrypted_data: encrypted.encrypted_data,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    category: mergedPlain.category,
    title: mergedPlain.title,
    tags,
    logoUrl,
    isFavorite: payload.isFavorite ?? existing.isFavorite,
    field_count: payload.field_count ?? existing.field_count ?? 0,
    attachment_count: payload.attachment_count ?? existing.attachment_count ?? 0,
  };
  // Replace folder when provided (supports oldFolderId + new folderId).
  if (payload.folderId !== undefined || payload.newFolderId !== undefined) {
    const nextFolderRaw =
      payload.newFolderId !== undefined ? payload.newFolderId : payload.folderId;
    if (nextFolderRaw === null || nextFolderRaw === '') {
      updateData.folderId = null;
    } else {
      const folderCheck = await assertFolderOwned(userId, String(nextFolderRaw));
      updateData.folderId = folderCheck.ok ? folderCheck.folderId : existing.folderId ?? null;
    }
  }

  const filter = {
    $and: [{ $or: [{ _id: new ObjectId(id) }, { id }] }, userFilter(userId), { deleted: { $ne: true } }],
  };

  const result = await db.updateOne(collection.vaultItems, filter, { $set: updateData });
  if (!result.matchedCount) return null;
  await applyPasswordFromPayload(userId, new ObjectId(id), payload);
  const incomingCustomFields = normalizeIncomingCustomFields(payload);
  if (incomingCustomFields.length > 0 || payload.custom_fields || payload.customFields) {
    await replaceCredentialCustomFields(userId, new ObjectId(id), incomingCustomFields);
  }

  const authenticatorEntryId =
    payload.authenticatorEntryId != null ? String(payload.authenticatorEntryId).trim() : '';
  const incomingMfa = readMfaSecret(payload);
  let authenticatorLinkError: string | null = null;
  let authenticatorLinkCode: string | null = null;
  if (authenticatorEntryId || incomingMfa !== undefined) {
    try {
      const syncResult = await syncAuthenticatorForVaultItem(userId, id, {
        authenticatorEntryId: authenticatorEntryId || null,
        mfaSecret: authenticatorEntryId
          ? null
          : incomingMfa !== undefined
            ? String(incomingMfa || '').trim() || null
            : undefined,
        issuer: payload.issuer ?? payload.mfaIssuer ?? null,
        accountName: payload.accountName ?? payload.mfaAccountName ?? mergedPlain.title ?? null,
      });
      if (syncResult.ok === false) {
        authenticatorLinkError = syncResult.message;
        authenticatorLinkCode = syncResult.code || 'AUTHENTICATOR_LINK_FAILED';
      }
    } catch (err) {
      authenticatorLinkError =
        err instanceof Error ? err.message : 'Authenticator could not be linked to this item.';
      authenticatorLinkCode = 'AUTHENTICATOR_LINK_FAILED';
    }
  }

  const updated = await db.findOne(collection.vaultItems, filter);
  const activePassword = await getActivePasswordVersion(userId, new ObjectId(id));
  const versions = await resolvePasswordVersionsForResponse(userId, new ObjectId(id));
  const customFields = await getCustomFields(userId, new ObjectId(id), true);
  await bumpVaultDataRevision(userId);

  let mfaSecret = mergedPlain.mfaSecret as string | null;
  if (!mfaSecret) {
    const linked = await findAuthenticatorByVaultItemId(userId, id, { revealSecret: true });
    mfaSecret = linked?.secret ?? null;
  }

  return {
    ...updated,
    ...mergedPlain,
    mfaSecret,
    tags,
    logoUrl,
    password: activePassword?.password,
    password_versions: versions,
    ...(authenticatorLinkError
      ? { authenticatorLinkError, authenticatorLinkCode }
      : {}),
    custom_fields: customFields,
  };
};

/** Move item between folders (or to no folder). Accepts oldFolderId + new folderId. */
export const moveItemToFolder = async (
  userId: string,
  id: string,
  payload: { folderId?: string | null; newFolderId?: string | null; oldFolderId?: string | null },
) => {
  const existing: any = await getItemById(userId, id);
  if (!existing) return { ok: false as const, reason: 'NOT_FOUND' as const };

  const currentFolderId =
    existing.folderId?.toString?.() || (existing.folderId as string | null) || null;

  if (payload.oldFolderId !== undefined && payload.oldFolderId !== null) {
    const expected = String(payload.oldFolderId);
    if ((currentFolderId || '') !== expected) {
      return { ok: false as const, reason: 'FOLDER_MISMATCH' as const };
    }
  } else if (payload.oldFolderId === null && currentFolderId) {
    return { ok: false as const, reason: 'FOLDER_MISMATCH' as const };
  }

  const nextRaw = payload.newFolderId !== undefined ? payload.newFolderId : payload.folderId;
  let nextFolderId: ObjectId | null = null;
  if (nextRaw !== undefined && nextRaw !== null && nextRaw !== '') {
    const folderCheck = await assertFolderOwned(userId, String(nextRaw));
    if (!folderCheck.ok) {
      return { ok: false as const, reason: 'FOLDER_NOT_FOUND' as const };
    }
    nextFolderId = folderCheck.folderId;
  }

  const filter = {
    $and: [{ $or: [{ _id: new ObjectId(id) }, { id }] }, userFilter(userId), { deleted: { $ne: true } }],
  };
  await db.updateOne(collection.vaultItems, filter, {
    $set: {
      folderId: nextFolderId,
      updatedAt: new Date(),
      source: 'mobile',
      sync_status: 'synced',
      synced_at: new Date(),
      cloud_version: Number(existing.cloud_version || 0) + 1,
    },
  });
  await bumpVaultDataRevision(userId);
  const item = await getItemById(userId, id, true);
  return { ok: true as const, item };
};

export const deleteItemById = async (userId: string, id: string) => {
  const filter = {
    $and: [{ $or: [{ _id: new ObjectId(id) }, { id }] }, userFilter(userId), { deleted: { $ne: true } }],
  };
  const result = await db.updateOne(collection.vaultItems, filter, {
    $set: { deleted: true, deleted_at: new Date(), source: 'mobile' },
  });
  if (result.matchedCount) {
    await db.getDb().collection(collection.customFields).updateMany(
      { credentialId: new ObjectId(id), ...userFilter(userId), deleted: { $ne: true } },
      { $set: { deleted: true, deletedAt: new Date(), source: 'mobile' } },
    );
    // Soft-delete linked authenticator entries so the Tools → Authenticator list stays in sync.
    if (ObjectId.isValid(id)) {
      const now = new Date();
      await db.getDb().collection(collection.authenticatorEntries).updateMany(
        {
          ...userFilter(userId),
          deleted: { $ne: true },
          vaultItemId: new ObjectId(id),
        },
        { $set: { deleted: true, deleted_at: now, deletedAt: now, updatedAt: now } },
      );
    }
    try {
      const { deleteAllAttachmentsForItem } = await import('./item-attachments.service');
      await deleteAllAttachmentsForItem(userId, id);
    } catch {
      // Best-effort NAS/metadata cleanup — item soft-delete already succeeded.
    }
    await bumpVaultDataRevision(userId);
  }
  return result.matchedCount > 0;
};

export const markPasswordVersionExpired = async (userId: string, itemId: string, versionId: string) => {
  const credentialId = new ObjectId(itemId);
  const versionObjectId = new ObjectId(versionId);
  const result = await db.updateOne(collection.passwordVersions, {
    _id: versionObjectId,
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
  }, {
    $set: { is_expired: true, updatedAt: new Date(), source: 'mobile' },
  });
  if (result.matchedCount) await bumpVaultDataRevision(userId);
  return result.matchedCount > 0;
};

export const deletePasswordVersion = async (userId: string, itemId: string, versionId: string) => {
  const credentialId = new ObjectId(itemId);
  const versionObjectId = new ObjectId(versionId);
  const versions = await getPasswordVersions(userId, credentialId);
  const activeCount = versions.filter((v: any) => !v.is_expired).length;
  const target = versions.find((v: any) => v.id === versionId);
  if (target && !target.is_expired && activeCount <= 1) {
    throw new Error('Cannot delete the only active password version');
  }
  const result = await db.updateOne(collection.passwordVersions, {
    _id: versionObjectId,
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
  }, {
    $set: { deleted: true, deletedAt: new Date(), source: 'mobile' },
  });
  if (result.matchedCount) await bumpVaultDataRevision(userId);
  return result.matchedCount > 0;
};

export const addCustomField = async (
  userId: string,
  itemId: string,
  payload: { field_label: string; field_type: string; field_value: string; is_sensitive?: boolean },
) => {
  const credentialId = new ObjectId(itemId);
  const item = await db.findOne(collection.vaultItems, {
    $and: [{ _id: credentialId }, userFilter(userId), { deleted: { $ne: true } }],
  });
  if (!item) return null;
  const fieldType = parseFieldType(payload.field_type);
  const label = String(payload.field_label || '').trim();
  if (!fieldType || !label) throw new Error('Invalid field label or type');
  const rawValue = String(payload.field_value ?? '');
  const isSensitive = payload.is_sensitive === true || SENSITIVE_FIELD_TYPES.has(fieldType);
  const duplicate = await db.findOne(collection.customFields, {
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
    field_label: { $regex: `^${label}$`, $options: 'i' },
  });
  if (duplicate) throw new Error('Field label already exists');
  const now = new Date();
  const baseDoc: any = {
    userId: new ObjectId(userId),
    credentialId,
    field_label: label,
    field_type: fieldType,
    is_sensitive: isSensitive,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    source: 'mobile',
  };
  if (isSensitive) {
    const encrypted = encryptText(rawValue);
    Object.assign(baseDoc, encrypted);
  } else {
    baseDoc.field_value = rawValue;
  }
  await db.insertOne(collection.customFields, baseDoc);
  await bumpVaultDataRevision(userId);
  return getItemById(userId, itemId, false);
};

export const updateCustomField = async (
  userId: string,
  itemId: string,
  fieldId: string,
  payload: { field_label?: string; field_type?: string; field_value?: string; is_sensitive?: boolean },
) => {
  const credentialId = new ObjectId(itemId);
  const existing = await db.findOne(collection.customFields, {
    _id: new ObjectId(fieldId),
    credentialId,
    ...userFilter(userId),
    deleted: { $ne: true },
  });
  if (!existing) return null;
  const nextType = parseFieldType(payload.field_type || existing.field_type);
  if (!nextType) throw new Error('Invalid field type');
  const nextLabel = String(payload.field_label ?? existing.field_label ?? '').trim();
  if (!nextLabel) throw new Error('Field label is required');
  const nextValue = String(payload.field_value ?? (existing.is_sensitive ? decryptText(existing as any) || '' : existing.field_value || ''));
  const nextSensitive = payload.is_sensitive === undefined
    ? Boolean(existing.is_sensitive || SENSITIVE_FIELD_TYPES.has(nextType))
    : Boolean(payload.is_sensitive || SENSITIVE_FIELD_TYPES.has(nextType));
  const setData: any = {
    field_label: nextLabel,
    field_type: nextType,
    is_sensitive: nextSensitive,
    updatedAt: new Date(),
    source: 'mobile',
  };
  if (nextSensitive) {
    const encrypted = encryptText(nextValue);
    Object.assign(setData, encrypted);
    setData.field_value = null;
  } else {
    setData.field_value = nextValue;
    setData.encrypted_data = null;
    setData.iv = null;
    setData.authTag = null;
  }
  await db.updateOne(collection.customFields, { _id: new ObjectId(fieldId) }, { $set: setData });
  await bumpVaultDataRevision(userId);
  return getItemById(userId, itemId, false);
};

export const deleteCustomField = async (userId: string, itemId: string, fieldId: string) => {
  const result = await db.updateOne(collection.customFields, {
    _id: new ObjectId(fieldId),
    credentialId: new ObjectId(itemId),
    ...userFilter(userId),
    deleted: { $ne: true },
  }, {
    $set: { deleted: true, deletedAt: new Date(), source: 'mobile' },
  });
  if (!result.matchedCount) return null;
  await bumpVaultDataRevision(userId);
  return getItemById(userId, itemId, false);
};

export const syncBulkUpload = async (
  userId: string,
  payload: {
    operations?: Array<{ op: 'create' | 'update' | 'delete'; itemId: string; payload?: any }>;
    deviceId?: string;
  },
) => {
  const operations = Array.isArray(payload.operations) ? payload.operations : [];
  const syncedIds: string[] = [];
  for (const op of operations) {
    try {
      if (op.op === 'create') {
        const category = String(op.payload?.category || op.payload?.type || 'login');
        const authEntryId =
          op.payload?.authenticatorEntryId != null
            ? String(op.payload.authenticatorEntryId).trim()
            : '';
        const mfaRaw = op.payload?.mfaSecret ?? op.payload?.mfa_secret;
        const willCreateAuthenticator =
          !authEntryId &&
          mfaRaw != null &&
          String(mfaRaw).trim() !== '' &&
          String(mfaRaw).trim() !== 'null';
        const allowed = await assertCanCreateVaultItem(userId, category, {
          consumeAuthenticatorSlot: willCreateAuthenticator,
        });
        if (!allowed.ok) {
          continue;
        }
        const created = await createItem(userId, { ...(op.payload || {}), deviceId: payload.deviceId, localVersion: op.payload?.localVersion || 1 });
        const createdId = (created as any)?.id || (created as any)?._id?.toString?.();
        if (createdId) syncedIds.push(String(createdId));
      } else if (op.op === 'update') {
        const canWrite = await assertCanModifyVault(userId);
        if (!canWrite.ok) {
          continue;
        }
        const updated = await updateItemById(userId, op.itemId, { ...(op.payload || {}), deviceId: payload.deviceId });
        const updatedId = (updated as any)?.id || (updated as any)?._id?.toString?.();
        if (updatedId) syncedIds.push(String(updatedId));
      } else if (op.op === 'delete') {
        const deleted = await deleteItemById(userId, op.itemId);
        if (deleted) syncedIds.push(op.itemId);
      }
    } catch {
      // Continue best-effort syncing for remaining operations.
    }
  }
  await db.updateOne(COLLECTIONS.vaultUsers, { _id: new ObjectId(userId) }, { $set: { lastVaultSyncedAt: new Date() } });
  return { syncedIds, syncedAt: new Date().toISOString() };
};

export const pullSyncDeltaItems = async (userId: string, since?: string) => {
  const updatedAtFilter = since ? { $gt: new Date(since) } : undefined;
  const query: any = {
    ...userFilter(userId),
    deleted: { $ne: true },
    deleted_at: null,
  };
  if (updatedAtFilter) query.updatedAt = updatedAtFilter;

  const items = await db.findMany(collection.vaultItems, query, { sort: { updatedAt: -1 }, limit: 500 });
  return Promise.all(items.map(async (item: any) => {
    const decrypted = decryptPayload(item as any) || {};
    const activePassword = await getActivePasswordVersion(userId, item._id);
    const customFields = await getCustomFields(userId, item._id, true);
    return {
      ...item,
      ...decrypted,
      id: item._id?.toString?.(),
      password: activePassword?.password,
      custom_fields: customFields,
      sync_status: item.sync_status || 'synced',
      synced_at: item.synced_at || item.updatedAt,
      local_version: item.local_version || 1,
      cloud_version: item.cloud_version || 1,
      device_id: item.device_id || null,
    };
  }));
};

export const getDashboardStats = async (userId: string) => {
  const query = {
    ...userFilter(userId),
    deleted: { $ne: true },
    deleted_at: null,
  };

  const allItems = await db.findMany(collection.vaultItems, query, {
    limit: 50,
    sort: { lastAccessedAt: -1, updatedAt: -1 },
  });
  const totalItems = await db.getDb().collection(collection.vaultItems).countDocuments(query);

  const authLinks = await db.findMany(
    collection.authenticatorEntries,
    { ...userFilter(userId), deleted: { $ne: true }, vaultItemId: { $ne: null } },
    { limit: 500 },
  );
  const linkedItemIds = new Set(
    authLinks
      .map((a: any) => a.vaultItemId?.toString?.() || String(a.vaultItemId || ''))
      .filter(Boolean),
  );

  const enrichedItems = await Promise.all(
    allItems.map(async (item: any) => {
      const decrypted = decryptPayload(item as any) || {};
      const activePassword = await getActivePasswordVersion(userId, item._id);
      const password = activePassword?.password;
      const mfaSecret = readMfaSecret(decrypted);
      const itemId = String(item._id?.toString?.() || item._id || '');
      // Explicit mfaSecret / linked flag so toMobileItemSummary.hasMfa is reliable for recently-used.
      return {
        ...item,
        ...decrypted,
        password,
        strength: getPasswordStrength(password),
        mfaSecret: mfaSecret ? String(mfaSecret) : null,
        hasLinkedAuthenticator: !mfaSecret && linkedItemIds.has(itemId),
      };
    }),
  );

  const weakPasswordsCount = enrichedItems.filter((item) => item.strength === 'weak').length;
  const reusedPasswordsCount = enrichedItems.filter((item) => Boolean(item.reused)).length;
  const breachedPasswordsCount = enrichedItems.filter((item) => Boolean(item.breached)).length;
  const riskRatio = totalItems > 0 ? ((weakPasswordsCount + reusedPasswordsCount + breachedPasswordsCount) / totalItems) : 0;
  const computedScore = Math.max(0, Math.min(100, Math.round(100 - (riskRatio * 100))));

  return {
    totalItems,
    weakPasswordsCount,
    reusedPasswordsCount,
    breachedPasswordsCount,
    securityScore: computedScore,
    recentlyUsed: enrichedItems.slice(0, 5),
  };
};
