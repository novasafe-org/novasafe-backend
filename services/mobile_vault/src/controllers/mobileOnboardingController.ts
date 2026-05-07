import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { DB_CONFIG } from '../config/dbConfig';
import Database from '../database/connection';
import { sendSignupOTPEmail } from '../services/emailService';

const db = new Database('vault');

const randomOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;

export const checkEmail = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) return void res.status(400).json({ success: false, message: 'Email is required' });
  const existing = await db.findOne(DB_CONFIG.collections.vaultUsers, { email, deleted: { $ne: true } });
  res.status(200).json({ success: true, source: req.source, exists: Boolean(existing) });
};

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) return void res.status(400).json({ success: false, message: 'Email is required' });
  const code = randomOtp();
  await db.getDb().collection(DB_CONFIG.collections.otpCodes).updateOne(
    { email, purpose: 'signup' },
    { $set: { email, purpose: 'signup', code, expiresAt: new Date(Date.now() + 10 * 60 * 1000), updatedAt: new Date() } },
    { upsert: true },
  );
  const sent = await sendSignupOTPEmail(email, code);
  if (!sent) {
    return void res.status(500).json({ success: false, message: 'Unable to send OTP email. Check SMTP configuration.' });
  }
  res.status(200).json({ success: true, source: req.source, message: 'OTP sent to your email' });
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const otp = String(req.body?.otp || '').trim();
  const record = await db.findOne(DB_CONFIG.collections.otpCodes, {
    email,
    purpose: 'signup',
    code: otp,
    expiresAt: { $gt: new Date() },
  });
  if (!record) return void res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
  res.status(200).json({ success: true, source: req.source, message: 'OTP verified' });
};

export const createAccount = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const fullName = String(req.body?.fullName || '').trim();
  const password = String(req.body?.password || '');
  if (!email || !fullName || password.length < 8) {
    return void res.status(400).json({ success: false, message: 'email, fullName and strong password are required' });
  }
  const existing = await db.findOne(DB_CONFIG.collections.vaultUsers, { email });
  if (existing && existing.deleted !== true) {
    return void res.status(409).json({ success: false, message: 'Email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  if (existing && existing.deleted === true) {
    await db.updateOne(
      DB_CONFIG.collections.vaultUsers,
      { _id: existing._id },
      {
        $set: {
          email,
          name: fullName,
          passwordHash,
          source: 'mobile',
          twoFactorEnabled: false,
          cloudSyncEnabled: false,
          cloudSyncUpdatedAt: now,
          deleted: false,
          deletedAt: null,
          updatedAt: now,
        },
      },
    );
  } else {
    await db.insertOne(DB_CONFIG.collections.vaultUsers, {
      email,
      name: fullName,
      passwordHash,
      source: 'mobile',
      twoFactorEnabled: false,
      cloudSyncEnabled: false,
      cloudSyncUpdatedAt: now,
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  res.status(201).json({ success: true, source: req.source, message: 'Account created' });
};
