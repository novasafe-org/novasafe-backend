import { ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { decryptPayload, decryptText, encryptPayload, encryptText } from '../utils/crypto';

const collection = DB_CONFIG.collections;
const db = new Database('vault');

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

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
  const normalized = String(fieldType || 'TEXT').toUpperCase();
  if (!CUSTOM_FIELD_TYPES.has(normalized)) return null;
  return normalized;
};

const normalizeCredentialPayload = (payload: any, existing?: any) => ({
  title: payload.title ?? existing?.title,
  username: payload.username ?? existing?.username,
  url: payload.url ?? existing?.url,
  notes: payload.notes ?? existing?.notes,
  cardNumber: payload.cardNumber ?? existing?.cardNumber,
  apiKey: payload.apiKey ?? existing?.apiKey,
  type: payload.type ?? existing?.type ?? 'login',
  category: payload.category ?? existing?.category ?? 'login',
});

const getPasswordVersions = async (userId: string, credentialId: ObjectId) => {
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

export const listItems = async (userId: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const query = {
    ...userFilter(userId),
    deleted: { $ne: true },
    deleted_at: null,
  };

  const [items, total] = await Promise.all([
    db.findMany(collection.vaultItems, query, { skip, limit, sort: { updatedAt: -1 } }),
    db.getDb().collection(collection.vaultItems).countDocuments(query),
  ]);

  const itemsWithDecrypted = await Promise.all(items.map(async (item: any) => {
    const decrypted = decryptPayload(item as any) || {};
    const activePassword = await getActivePasswordVersion(userId, item._id);
    return { ...item, ...decrypted, password: activePassword?.password };
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
  const passwordVersions = await getPasswordVersions(userId, item._id);
  const customFields = await getCustomFields(userId, item._id, revealSensitive);
  return {
    ...item,
    ...decrypted,
    password: activePassword?.password,
    password_versions: passwordVersions,
    custom_fields: customFields,
  };
};

export const createItem = async (userId: string, payload: any) => {
  const now = new Date();
  const normalizedPayload = normalizeCredentialPayload(payload);
  const encrypted = encryptPayload(normalizedPayload);
  const doc = {
    userId: new ObjectId(userId),
    encrypted_data: encrypted.encrypted_data,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    category: normalizedPayload.category,
    title: normalizedPayload.title,
    folderId: payload.folderId ? new ObjectId(payload.folderId) : null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isFavorite: Boolean(payload.isFavorite),
    field_count: payload.field_count || 0,
    attachment_count: payload.attachment_count || 0,
    source: 'mobile',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deleted_at: null,
    accessCount: 0,
    lastAccessedAt: null,
  };

  const result = await db.insertOne(collection.vaultItems, doc);
  if (payload.password) {
    await createPasswordVersion(userId, result.insertedId, String(payload.password));
  }
  if (Array.isArray(payload.custom_fields)) {
    for (const customField of payload.custom_fields) {
      const fieldType = parseFieldType(customField?.field_type);
      const label = String(customField?.field_label || '').trim();
      if (!fieldType || !label) continue;
      const rawValue = String(customField?.field_value ?? '');
      const isSensitive = customField?.is_sensitive === true || SENSITIVE_FIELD_TYPES.has(fieldType);
      const nowField = new Date();
      let toInsert: any = {
        userId: new ObjectId(userId),
        credentialId: result.insertedId,
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
  }
  const inserted = await db.findOne(collection.vaultItems, { _id: result.insertedId });
  const versions = await getPasswordVersions(userId, result.insertedId);
  const customFields = await getCustomFields(userId, result.insertedId, true);
  return {
    ...inserted,
    ...normalizedPayload,
    password: versions.find((v: any) => !v.is_expired)?.password,
    password_versions: versions,
    custom_fields: customFields,
  };
};

export const updateItemById = async (userId: string, id: string, payload: any) => {
  const existing: any = await getItemById(userId, id);
  if (!existing) return null;
  const mergedPlain = normalizeCredentialPayload(payload, existing);
  const encrypted = encryptPayload(mergedPlain);
  const updateData: any = {
    updatedAt: new Date(),
    source: 'mobile',
    encrypted_data: encrypted.encrypted_data,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    category: mergedPlain.category,
    title: mergedPlain.title,
    tags: payload.tags ?? existing.tags,
    isFavorite: payload.isFavorite ?? existing.isFavorite,
    field_count: payload.field_count ?? existing.field_count ?? 0,
    attachment_count: payload.attachment_count ?? existing.attachment_count ?? 0,
  };
  if (payload.folderId !== undefined) {
    updateData.folderId = payload.folderId ? new ObjectId(payload.folderId) : null;
  }

  const filter = {
    $and: [{ $or: [{ _id: new ObjectId(id) }, { id }] }, userFilter(userId), { deleted: { $ne: true } }],
  };

  const result = await db.updateOne(collection.vaultItems, filter, { $set: updateData });
  if (!result.matchedCount) return null;
  if (payload.password) {
    await createPasswordVersion(userId, new ObjectId(id), String(payload.password));
  }
  const updated = await db.findOne(collection.vaultItems, filter);
  const versions = await getPasswordVersions(userId, new ObjectId(id));
  const customFields = await getCustomFields(userId, new ObjectId(id), true);
  return {
    ...updated,
    ...mergedPlain,
    password: versions.find((v: any) => !v.is_expired)?.password,
    password_versions: versions,
    custom_fields: customFields,
  };
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
  return getItemById(userId, itemId, false);
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

  const weakPasswordsCount = allItems.filter((item: any) => {
    const decrypted = decryptPayload(item as any) || {};
    const password = String(decrypted?.password || '');
    if (!password) return false;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score <= 1;
  }).length;

  return {
    totalItems,
    weakPasswordsCount,
    recentlyUsed: allItems.slice(0, 5),
  };
};
