import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { sendTwoFactorEmail } from '../services/emailService';
import { generateToken } from '../utils/token';

const db = new Database('vault');
const resolveClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) return String(forwarded[0]);
  return req.socket.remoteAddress || 'Unknown';
};

const resolveDeviceInfo = (req: Request) => {
  const ua = String(req.headers['user-agent'] || 'Unknown Device');
  const lower = ua.toLowerCase();
  const requestPlatform = String(req.body?.devicePlatform || '').toLowerCase().trim();
  const requestModel = String(req.body?.deviceModel || '').trim();
  const requestOsVersion = String(req.body?.deviceOsVersion || '').trim();
  const platform = lower.includes('android')
    ? 'android'
    : lower.includes('iphone') || lower.includes('ios')
      ? 'ios'
      : lower.includes('windows')
        ? 'windows'
        : lower.includes('mac')
          ? 'macos'
          : 'web';
  const normalizedPlatform = requestPlatform || platform;
  const deviceName = requestModel
    ? `${requestModel}${requestOsVersion ? ` - ${normalizedPlatform} ${requestOsVersion}` : ` - ${normalizedPlatform}`}`
    : ua.slice(0, 80);
  return { deviceName, platform: normalizedPlatform, userAgent: ua };
};

export const mobileLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return void res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, {
    email: String(email).toLowerCase().trim(),
    deleted: { $ne: true },
  });
  if (!user?.passwordHash) {
    return void res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return void res.status(401).json({ success: false, message: 'Invalid email or password' });

  if (user.twoFactorEnabled) {
    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    await db.getDb().collection(DB_CONFIG.collections.twoFactorChallenges).insertOne({
      userId: new ObjectId(user._id),
      email: user.email,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verified: false,
      createdAt: new Date(),
      source: 'mobile',
    });
    const sent = await sendTwoFactorEmail(user.email, code);
    if (!sent) {
      return void res.status(500).json({ success: false, message: 'Unable to send 2FA code email. Check SMTP configuration.' });
    }
    return void res.status(200).json({
      success: true,
      source: req.source,
      requiresTwoFactor: true,
      message: 'Two-factor verification required',
      user: {
        id: user._id?.toString() || user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  }

  const tokenResult = generateToken({
    id: user._id?.toString() || user.googleId,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });

  const ipAddress = resolveClientIp(req);
  const device = resolveDeviceInfo(req);
  await db.insertOne(DB_CONFIG.collections.sessions, {
    userId: new ObjectId(user._id),
    tokenId: tokenResult.tokenId,
    revoked: false,
    source: 'mobile',
    ipAddress,
    deviceName: device.deviceName,
    platform: device.platform,
    userAgent: device.userAgent,
    createdAt: new Date(),
    lastActivity: new Date(),
  });

  res.status(200).json({
    success: true,
    source: req.source,
    token: tokenResult.token,
    user: {
      id: user._id?.toString() || user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  });
};

export const mobileVerifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const code = String(req.body?.code || '').trim();
  if (!email || !code) return void res.status(400).json({ success: false, message: 'Email and code are required' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { email });
  if (!user?._id) return void res.status(404).json({ success: false, message: 'User not found' });
  const challenge = await db.findOne(DB_CONFIG.collections.twoFactorChallenges, {
    userId: new ObjectId(user._id),
    code,
    verified: false,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) return void res.status(400).json({ success: false, message: 'Invalid or expired verification code' });

  await db.updateOne(
    DB_CONFIG.collections.twoFactorChallenges,
    { _id: challenge._id },
    { $set: { verified: true, verifiedAt: new Date() } },
  );

  const tokenResult = generateToken({
    id: user._id?.toString() || user.googleId,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });

  const ipAddress = resolveClientIp(req);
  const device = resolveDeviceInfo(req);
  await db.insertOne(DB_CONFIG.collections.sessions, {
    userId: new ObjectId(user._id),
    tokenId: tokenResult.tokenId,
    revoked: false,
    source: 'mobile',
    ipAddress,
    deviceName: device.deviceName,
    platform: device.platform,
    userAgent: device.userAgent,
    createdAt: new Date(),
    lastActivity: new Date(),
  });

  res.status(200).json({
    success: true,
    source: req.source,
    token: tokenResult.token,
    user: {
      id: user._id?.toString() || user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  });
};

export const mobileValidateSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) return void res.status(401).json({ success: false, message: 'Authentication required' });
  if (!ObjectId.isValid(req.user.id)) return void res.status(401).json({ success: false, message: 'Invalid session user id' });
  const user = await db.findOne(DB_CONFIG.collections.vaultUsers, { _id: new ObjectId(req.user.id) });
  if (!user) return void res.status(404).json({ success: false, message: 'User not found' });

  res.status(200).json({
    success: true,
    source: req.source,
    user: {
      id: user._id?.toString() || user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  });
};

export const mobileLogout = async (req: Request, res: Response): Promise<void> => {
  if (!req.tokenId) return void res.status(200).json({ success: true, source: req.source, message: 'Logout successful' });
  await db.updateOne(DB_CONFIG.collections.sessions, { tokenId: req.tokenId }, { $set: { revoked: true, revokedAt: new Date() } });
  res.status(200).json({ success: true, source: req.source, message: 'Logout successful' });
};
