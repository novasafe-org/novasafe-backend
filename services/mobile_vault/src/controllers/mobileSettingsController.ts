import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { decryptPayload } from '../utils/crypto';
import { sendSignupOTPEmail } from '../services/emailService';
import { bumpVaultDataRevision, createItem, listItems, updateItemById } from '../services/mobileVaultService';
import { assertEntitlement } from '../services/subscriptionService';

const db = new Database('vault');

const getSessionFreshness = (lastActivity?: Date | string | null): 'recently_active' | 'offline' => {
  if (!lastActivity) return 'offline';
  const at = new Date(lastActivity).getTime();
  if (Number.isNaN(at)) return 'offline';
  const diffMinutes = (Date.now() - at) / (1000 * 60);
  return diffMinutes <= 30 ? 'recently_active' : 'offline';
};

const parseUserAgent = (userAgent?: string, fallbackPlatform?: string, fallbackDeviceName?: string) => {
  const ua = String(userAgent || '').toLowerCase();
  const platformRaw = String(fallbackPlatform || '').toLowerCase();
  const platform = ua.includes('android') || platformRaw.includes('android')
    ? 'android'
    : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios') || platformRaw.includes('ios')
      ? 'ios'
      : ua.includes('windows') || platformRaw.includes('windows')
        ? 'windows'
        : ua.includes('mac os') || ua.includes('macintosh') || platformRaw.includes('mac')
          ? 'macos'
          : ua.includes('linux')
            ? 'linux'
            : 'web';

  const deviceType = ua.includes('ipad') || (ua.includes('tablet'))
    ? 'tablet'
    : ua.includes('iphone') || ua.includes('android') || platform === 'ios'
      ? 'mobile'
      : 'desktop';

  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('safari') && !ua.includes('chrome')
          ? 'Safari'
          : ua.includes('chrome')
            ? 'Chrome'
            : 'NovaSafe Mobile';

  const os = platform === 'android'
    ? 'Android'
    : platform === 'ios'
      ? 'iOS'
      : platform === 'windows'
        ? 'Windows'
        : platform === 'macos'
          ? 'macOS'
          : platform === 'linux'
            ? 'Linux'
            : 'Web';

  const deviceName = String(fallbackDeviceName || '').trim();
  const displayName = deviceName && !/unknown/i.test(deviceName)
    ? deviceName
    : `${browser} on ${os}`;

  return {
    platform,
    deviceType,
    browser,
    os,
    model: deviceName || null,
    displayName,
  };
};

const getUserObjectId = (req: Request): ObjectId | null => {
  const userId = req.user?.id;
  if (!userId || !ObjectId.isValid(userId)) return null;
  return new ObjectId(userId);
};

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  const authMethods = Array.isArray(user?.auth_methods)
    ? user.auth_methods
    : user?.passwordHash
      ? ['local']
      : [];
  const hasPassword = typeof user?.has_password === 'boolean' ? user.has_password : Boolean(user?.passwordHash);
  const authProvider = String(user?.auth_provider || '').toLowerCase() || null;
  res.status(200).json({
    success: true,
    source: req.source,
    settings: {
      twoFactorEnabled: Boolean(user?.twoFactorEnabled),
      cloudSyncEnabled: user?.cloudSyncEnabled ?? true,
      notificationsEnabled: user?.notificationsEnabled ?? true,
      hasPassword,
      authMethods,
      authProvider,
      canSetLoginPassword: !hasPassword,
      updatedAt: user?.updatedAt || user?.createdAt || null,
    },
  });
};

export const getSyncSettings = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  res.status(200).json({
    success: true,
    source: req.source,
    cloudSyncEnabled: user?.cloudSyncEnabled ?? true,
    lastSyncedAt: user?.lastVaultSyncedAt || null,
  });
};

export const updateSyncSettings = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const cloudSyncEnabled = Boolean(req.body?.cloudSyncEnabled);
  const deleteCloudOnDisable = Boolean(req.body?.deleteCloudOnDisable);

  if (cloudSyncEnabled) {
    const entitlement = await assertEntitlement(userObjectId.toString(), 'canUseCloudSync');
    if (!entitlement.ok && "message" in entitlement) {
      return void res.status(403).json({
        success: false,
        code: 'NOVASAFE_SUBSCRIPTION_REQUIRED',
        message: entitlement.message,
        entitlement: 'canUseCloudSync',
        subscription: entitlement.state,
      });
    }
  }

  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: userObjectId },
    {
      $set: {
        cloudSyncEnabled,
        cloudSyncUpdatedAt: new Date(),
        source: 'mobile',
      },
    },
  );

  if (!cloudSyncEnabled && deleteCloudOnDisable) {
    await db.getDb().collection(DB_CONFIG.collections.vaultItems).updateMany(
      { userId: userObjectId, deleted: { $ne: true }, deleted_at: null },
      { $set: { deleted: true, deleted_at: new Date(), source: 'mobile' } },
    );
  }

  await bumpVaultDataRevision(userObjectId.toString());

  const updated = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  res.status(200).json({
    success: true,
    source: req.source,
    cloudSyncEnabled: updated?.cloudSyncEnabled ?? cloudSyncEnabled,
    lastSyncedAt: updated?.lastVaultSyncedAt || null,
  });
};

export const getTwoFactorStatus = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  res.status(200).json({ success: true, source: req.source, enabled: Boolean(user?.twoFactorEnabled) });
};

export const updateTwoFactorStatus = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const enabled = Boolean(req.body?.enabled);
  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: userObjectId },
    { $set: { twoFactorEnabled: enabled, updatedAt: new Date(), source: 'mobile' } },
  );
  res.status(200).json({ success: true, source: req.source, enabled });
};

export const changeMasterPassword = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return void res.status(400).json({ success: false, message: 'currentPassword and strong newPassword are required' });
  }

  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  if (!user?.passwordHash) return void res.status(404).json({ success: false, message: 'User not found' });
  const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!valid) return void res.status(400).json({ success: false, message: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(String(newPassword), 10);
  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: userObjectId },
    { $set: { passwordHash: newHash, updatedAt: new Date(), source: 'mobile' } },
  );
  res.status(200).json({ success: true, source: req.source, message: 'Password changed successfully' });
};

export const verifyMasterPassword = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const { password } = req.body || {};
  if (!password) {
    return void res.status(400).json({ success: false, message: 'password is required' });
  }
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  if (!user?.passwordHash) return void res.status(404).json({ success: false, message: 'User not found' });
  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) return void res.status(400).json({ success: false, message: 'Invalid master password' });
  res.status(200).json({ success: true, source: req.source, verified: true });
};

export const setLoginPassword = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return void res.status(400).json({ success: false, message: 'A strong newPassword is required' });
  }

  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId, deleted: { $ne: true } });
  if (!user?._id) return void res.status(404).json({ success: false, message: 'User not found' });
  if (user.passwordHash || user.has_password) {
    return void res.status(409).json({ success: false, message: 'Login password already configured' });
  }

  const now = new Date();
  const newHash = await bcrypt.hash(String(newPassword), 10);
  const existingMethods = Array.isArray(user.auth_methods) ? user.auth_methods : [];
  const authMethods = existingMethods.includes('local') ? existingMethods : [...existingMethods, 'local'];
  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: userObjectId },
    {
      $set: {
        passwordHash: newHash,
        has_password: true,
        auth_methods: authMethods,
        updatedAt: now,
        source: 'mobile',
      },
    },
  );

  console.info('[Settings] Local login password configured for OAuth account', { userId: userObjectId.toString() });
  res.status(200).json({
    success: true,
    source: req.source,
    message: 'Login password set successfully',
    authMethods,
    hasPassword: true,
  });
};

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const sessions = await db.findMany(
    DB_CONFIG.collections.sessions,
    { userId: userObjectId, revoked: { $ne: true } },
    { sort: { lastActivity: -1 }, limit: 20 },
  );
  const tokenId = req.tokenId;
  const mapped = sessions.map((s: any) => {
    const parsed = parseUserAgent(s.userAgent, s.platform, s.deviceName);
    const trustState = parsed.platform === 'android' || parsed.platform === 'ios' ? 'trusted' : 'needs_verification';
    const activityState = getSessionFreshness(s.lastActivity);
    return {
    id: s._id?.toString?.(),
    tokenId: s.tokenId,
    isCurrent: Boolean(tokenId && s.tokenId === tokenId),
    source: s.source || 'mobile',
    deviceName: s.deviceName || 'Current Device',
    platform: s.platform || 'android',
    ipAddress: s.ipAddress || 'Unknown',
    userAgent: s.userAgent || 'Unknown',
    parsedDevice: parsed,
    trustState,
    activityState,
    locationLabel: s.locationLabel || 'Unknown location',
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
  };});
  const dedupedMap = new Map<string, any>();
  for (const session of mapped) {
    const key = session.tokenId || session.id;
    if (!dedupedMap.has(key)) dedupedMap.set(key, session);
  }
  const deduped = Array.from(dedupedMap.values());
  const trustedCount = deduped.filter((s) => s.trustState === 'trusted' || s.isCurrent).length;
  const suspiciousCount = deduped.filter((s) => s.trustState === 'needs_verification' && !s.isCurrent).length;
  const recentActivityCount = deduped.filter((s) => s.activityState === 'recently_active').length;
  const lastSyncAt = deduped.reduce<string | null>((latest, session) => {
    const at = session.lastActivity ? new Date(session.lastActivity).getTime() : 0;
    if (!at || Number.isNaN(at)) return latest;
    if (!latest) return new Date(at).toISOString();
    return at > new Date(latest).getTime() ? new Date(at).toISOString() : latest;
  }, null);
  res.status(200).json({
    success: true,
    source: req.source,
    count: deduped.length,
    sessions: deduped,
    securityOverview: {
      activeSessions: deduped.length,
      trustedDevices: trustedCount,
      suspiciousSessions: suspiciousCount,
      recentActivity: recentActivityCount,
      lastSyncAt,
    },
  });
};

export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const sessionId = req.params.id;
  if (!ObjectId.isValid(sessionId)) return void res.status(400).json({ success: false, message: 'Invalid session id' });
  await db.updateOne(
    DB_CONFIG.collections.sessions,
    { _id: new ObjectId(sessionId), userId: userObjectId },
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );
  res.status(200).json({ success: true, source: req.source, message: 'Session revoked' });
};

export const revokeAllOtherSessions = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!req.tokenId) return void res.status(400).json({ success: false, message: 'Current session token not found' });
  const result = await db.getDb().collection(DB_CONFIG.collections.sessions).updateMany(
    { userId: userObjectId, revoked: { $ne: true }, tokenId: { $ne: req.tokenId } },
    { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
  );
  res.status(200).json({
    success: true,
    source: req.source,
    revokedCount: result.modifiedCount || 0,
    message: 'Signed out all other devices',
  });
};

export const createExport = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const now = new Date();
  const format = String(req.body?.format || 'csv').toLowerCase() === 'csv' ? 'csv' : 'csv';
  const items = await db.findMany(
    DB_CONFIG.collections.vaultItems,
    { userId: userObjectId, deleted: { $ne: true }, deleted_at: null },
    { sort: { updatedAt: -1 }, limit: 5000 },
  );
  const rows = items.map((item: any) => {
    const decrypted = decryptPayload(item as any) || {};
    return {
      title: decrypted.title || item.title || '',
      username: decrypted.username || '',
      url: decrypted.url || '',
      notes: decrypted.notes || '',
      category: item.category || decrypted.type || 'login',
      tags: Array.isArray(item.tags) ? item.tags.join('|') : '',
      updatedAt: item.updatedAt || '',
    };
  });
  const header = ['title', 'username', 'url', 'notes', 'category', 'tags', 'updatedAt'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => escape((r as any)[h])).join(','))].join('\n');

  const record = {
    userId: userObjectId,
    format,
    status: 'completed',
    itemCount: rows.length,
    fileName: `novasafe-export-${now.getTime()}.csv`,
    payload: Buffer.from(csv, 'utf-8').toString('base64'),
    createdAt: now,
    source: 'mobile',
  };
  await db.insertOne(DB_CONFIG.collections.exportHistory, record);
  res.status(201).json({ success: true, source: req.source, message: 'Export recorded', data: record });
};

export const downloadExportById = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return void res.status(400).json({ success: false, message: 'Invalid export id' });
  const record = await db.findOne(DB_CONFIG.collections.exportHistory, { _id: new ObjectId(id), userId: userObjectId });
  if (!record?.payload) return void res.status(404).json({ success: false, message: 'Export file not found' });
  const buffer = Buffer.from(String(record.payload), 'base64');
  const fileName = record.fileName || `novasafe-export-${id}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(buffer);
};

export const getExportHistory = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const records = await db.findMany(
    DB_CONFIG.collections.exportHistory,
    { userId: userObjectId },
    { sort: { createdAt: -1 }, limit: 30 },
  );
  const mapped = records.map((r: any) => ({
    id: r._id?.toString?.(),
    format: r.format,
    status: r.status,
    itemCount: r.itemCount,
    fileName: r.fileName,
    createdAt: r.createdAt,
  }));
  res.status(200).json({ success: true, source: req.source, history: mapped });
};

export const deleteExportHistoryItem = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const id = String(req.params.id || '');
  if (!ObjectId.isValid(id)) return void res.status(400).json({ success: false, message: 'Invalid export id' });
  const result = await db.getDb().collection(DB_CONFIG.collections.exportHistory).deleteOne({
    _id: new ObjectId(id),
    userId: userObjectId,
  });
  if (!result.deletedCount) return void res.status(404).json({ success: false, message: 'Export history not found' });
  res.status(200).json({ success: true, source: req.source, message: 'Export history deleted' });
};

interface ImportCsvRow {
  title?: string;
  type?: string;
  username?: string;
  password?: string;
  website?: string;
  notes?: string;
  category?: string;
  favorite?: string | boolean;
  created_at?: string;
  updated_at?: string;
  custom_fields_json?: string;
}

const SUPPORTED_IMPORT_TYPES = new Set(['login', 'note', 'card', 'key']);

const normalizeImportValue = (v: unknown): string => String(v ?? '').trim();

const duplicateKey = (row: Pick<ImportCsvRow, 'title' | 'type' | 'username' | 'website'>): string =>
  `${normalizeImportValue(row.title).toLowerCase()}|${normalizeImportValue(row.type || 'login').toLowerCase()}|${normalizeImportValue(row.username).toLowerCase()}|${normalizeImportValue(row.website).toLowerCase()}`;

export const importCsvData = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const duplicateMode = String(req.body?.duplicateMode || 'skip');
  const rows = Array.isArray(req.body?.rows) ? (req.body.rows as ImportCsvRow[]) : [];
  if (!rows.length) {
    return void res.status(400).json({ success: false, message: 'rows are required' });
  }

  const { items } = await listItems(userObjectId.toString(), 1, 5000);
  const existingByKey = new Map<string, any>();
  items.forEach((item: any) => {
    existingByKey.set(duplicateKey({
      title: item.title,
      type: item.type || item.category || 'login',
      username: item.username,
      website: item.url,
    }), item);
  });

  let imported = 0;
  let invalid = 0;
  let duplicates = 0;
  const errors: Array<{ index: number; message: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const type = normalizeImportValue(row.type || 'login').toLowerCase();
    const title = normalizeImportValue(row.title);
    const password = normalizeImportValue(row.password);

    if (!title || !password) {
      invalid += 1;
      errors.push({ index, message: 'title and password are required' });
      continue;
    }
    if (!SUPPORTED_IMPORT_TYPES.has(type)) {
      invalid += 1;
      errors.push({ index, message: `unsupported type: ${type}` });
      continue;
    }

    const key = duplicateKey({
      title,
      type,
      username: normalizeImportValue(row.username),
      website: normalizeImportValue(row.website),
    });
    const existing = existingByKey.get(key);
    if (existing) {
      duplicates += 1;
      if (duplicateMode === 'skip') {
        continue;
      }
      if (duplicateMode === 'replace') {
        await updateItemById(userObjectId.toString(), String(existing.id || existing._id), {
          title,
          type,
          category: normalizeImportValue(row.category || type),
          username: normalizeImportValue(row.username),
          password,
          url: normalizeImportValue(row.website),
          notes: normalizeImportValue(row.notes),
        });
        imported += 1;
        continue;
      }
    }

    await createItem(userObjectId.toString(), {
      title,
      type,
      category: normalizeImportValue(row.category || type),
      username: normalizeImportValue(row.username),
      password,
      url: normalizeImportValue(row.website),
      notes: normalizeImportValue(row.notes),
    });
    imported += 1;
  }

  res.status(200).json({
    success: true,
    source: req.source,
    summary: {
      totalRows: rows.length,
      imported,
      invalid,
      duplicates,
    },
    errors: errors.slice(0, 20),
  });
};

export const getAccountDeletionSummary = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const [itemCount, sessionCount, exportCount, user] = await Promise.all([
    db.getDb().collection(DB_CONFIG.collections.vaultItems).countDocuments({ userId: userObjectId, deleted: { $ne: true } }),
    db.getDb().collection(DB_CONFIG.collections.sessions).countDocuments({ userId: userObjectId, revoked: { $ne: true } }),
    db.getDb().collection(DB_CONFIG.collections.exportHistory).countDocuments({ userId: userObjectId }),
    db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId }),
  ]);
  res.status(200).json({
    success: true,
    source: req.source,
    summary: {
      email: user?.email,
      name: user?.name,
      itemCount,
      sessionCount,
      exportCount,
      createdAt: user?.createdAt || null,
    },
  });
};

export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  await Promise.all([
    db.updateOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId }, {
      $set: { deleted: true, deletedAt: new Date(), source: 'mobile' },
    }),
    db.getDb().collection(DB_CONFIG.collections.vaultItems).updateMany(
      { userId: userObjectId, deleted: { $ne: true } },
      { $set: { deleted: true, deleted_at: new Date(), source: 'mobile' } },
    ),
    db.getDb().collection(DB_CONFIG.collections.sessions).updateMany(
      { userId: userObjectId, revoked: { $ne: true } },
      { $set: { revoked: true, revokedAt: new Date(), source: 'mobile' } },
    ),
  ]);
  res.status(200).json({ success: true, source: req.source, message: 'Account deleted successfully' });
};

const VAULT_PIN_RESET_PURPOSE = 'vault_pin_reset';
const randomVaultPinOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const resolveVaultUserForPinReset = async (req: Request) => {
  const emailFromToken = String(req.user?.email || '')
    .toLowerCase()
    .trim();
  const userObjectId = getUserObjectId(req);
  let user =
    userObjectId != null
      ? await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId, deleted: { $ne: true } })
      : null;
  if (!user?.email && emailFromToken) {
    user = await db.findOne(DB_CONFIG.collections.vaultUsers, { email: emailFromToken, deleted: { $ne: true } });
  }
  return user;
};

export const sendVaultPinResetOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.email) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await resolveVaultUserForPinReset(req);
  if (!user?.email) return void res.status(404).json({ success: false, message: 'Account not found for this session' });
  const email = String(user.email).toLowerCase().trim();
  const code = randomVaultPinOtp();
  const now = new Date();
  await db.getDb().collection(DB_CONFIG.collections.otpCodes).updateOne(
    { email, purpose: VAULT_PIN_RESET_PURPOSE },
    {
      $set: {
        email,
        purpose: VAULT_PIN_RESET_PURPOSE,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        verifyAttempts: 0,
        updatedAt: now,
        lastSentAt: now,
      },
    },
    { upsert: true },
  );
  const sent = await sendSignupOTPEmail(email, code);
  if (!sent) {
    return void res.status(500).json({ success: false, message: 'Unable to send verification email. Check SMTP configuration.' });
  }
  res.status(200).json({ success: true, source: req.source, message: 'Verification code sent to your email' });
};

export const verifyVaultPinResetOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.email) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await resolveVaultUserForPinReset(req);
  if (!user?.email) return void res.status(404).json({ success: false, message: 'Account not found for this session' });
  const email = String(user.email).toLowerCase().trim();
  const otp = String(req.body?.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    return void res.status(400).json({ success: false, message: 'Enter the 6-digit code' });
  }
  const otpDoc = await db.findOne(DB_CONFIG.collections.otpCodes, {
    email,
    purpose: VAULT_PIN_RESET_PURPOSE,
    expiresAt: { $gt: new Date() },
  });
  if (!otpDoc) {
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }
  const attempts = Number(otpDoc.verifyAttempts ?? 0);
  if (attempts >= 8) {
    return void res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
  }
  if (String(otpDoc.code) !== otp) {
    await db.updateOne(
      DB_CONFIG.collections.otpCodes,
      { _id: otpDoc._id },
      { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } },
    );
    return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }
  await db.getDb().collection(DB_CONFIG.collections.otpCodes).deleteMany({ email, purpose: VAULT_PIN_RESET_PURPOSE });
  const verifiedUntil = new Date(Date.now() + 15 * 60 * 1000);
  await db.updateOne(
    DB_CONFIG.collections.vaultUsers,
    { _id: user._id },
    { $set: { vaultPinResetVerifiedUntil: verifiedUntil, updatedAt: new Date() } },
  );
  res.status(200).json({
    success: true,
    source: req.source,
    message: 'Email verified',
    verifiedUntil: verifiedUntil.toISOString(),
  });
};
