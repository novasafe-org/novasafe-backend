import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { decryptPayload } from '../utils/crypto';

const db = new Database('vault');

const getUserObjectId = (req: Request): ObjectId | null => {
  const userId = req.user?.id;
  if (!userId || !ObjectId.isValid(userId)) return null;
  return new ObjectId(userId);
};

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: userObjectId });
  res.status(200).json({
    success: true,
    source: req.source,
    settings: {
      twoFactorEnabled: Boolean(user?.twoFactorEnabled),
      notificationsEnabled: user?.notificationsEnabled ?? true,
      updatedAt: user?.updatedAt || user?.createdAt || null,
    },
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

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  const userObjectId = getUserObjectId(req);
  if (!userObjectId) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const sessions = await db.findMany(
    DB_CONFIG.collections.sessions,
    { userId: userObjectId, revoked: { $ne: true } },
    { sort: { lastActivity: -1 }, limit: 20 },
  );
  const tokenId = req.tokenId;
  const mapped = sessions.map((s: any) => ({
    id: s._id?.toString?.(),
    tokenId: s.tokenId,
    isCurrent: Boolean(tokenId && s.tokenId === tokenId),
    source: s.source || 'mobile',
    deviceName: s.deviceName || 'Current Device',
    platform: s.platform || 'android',
    ipAddress: s.ipAddress || 'Unknown',
    userAgent: s.userAgent || 'Unknown',
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
  }));
  const dedupedMap = new Map<string, any>();
  for (const session of mapped) {
    const key = session.tokenId || session.id;
    if (!dedupedMap.has(key)) dedupedMap.set(key, session);
  }
  const deduped = Array.from(dedupedMap.values());
  res.status(200).json({ success: true, source: req.source, count: deduped.length, sessions: deduped });
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
