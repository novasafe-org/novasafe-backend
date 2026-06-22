import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

import { ADMIN_COLLECTIONS, getDb, ObjectId } from '../../database/mongo';
import { logger } from '../../shared/logger';
import { sendPasswordResetEmail, sendTeamInviteEmail } from '../../shared/email.service';
import { isEmailConfigured } from '../../config/email.config';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  SYSTEM_ROLES,
} from './rbac.defaults';
import type {
  AdminJwtPayload,
  AdminRoleKey,
  AdminUserRecord,
  PermissionAction,
  PermissionKey,
} from './rbac.types';

const textEncoder = new TextEncoder();
const MIN_PASSWORD_LENGTH = 8;

function adminPanelUrl(): string {
  return (process.env.ADMIN_PANEL_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function validateNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function jwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be at least 32 characters');
  }
  return textEncoder.encode(secret);
}

export async function ensureRbacIndexes(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.collection(ADMIN_COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.roles).createIndex({ key: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.permissions).createIndex({ key: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.rolePermissions).createIndex({ roleKey: 1, permissionKey: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.invites).createIndex({ token: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.invites).createIndex({ email: 1 }),
    db.collection(ADMIN_COLLECTIONS.passwordResets).createIndex({ token: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.passwordResets).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export async function seedRbac(): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const role of SYSTEM_ROLES) {
    await db.collection(ADMIN_COLLECTIONS.roles).updateOne(
      { key: role.key },
      {
        $setOnInsert: {
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: true,
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true },
    );
  }

  for (const perm of PERMISSION_DEFINITIONS) {
    await db.collection(ADMIN_COLLECTIONS.permissions).updateOne(
      { key: perm.key },
      {
        $set: {
          key: perm.key,
          label: perm.label,
          module: perm.module,
          description: perm.description,
        },
      },
      { upsert: true },
    );
  }

  for (const [roleKey, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as Array<
    [AdminRoleKey, Partial<Record<PermissionKey, PermissionAction>>]
  >) {
    for (const def of PERMISSION_DEFINITIONS) {
      const action = perms[def.key] ?? 'none';
      await db.collection(ADMIN_COLLECTIONS.rolePermissions).updateOne(
        { roleKey, permissionKey: def.key },
        { $set: { roleKey, permissionKey: def.key, action } },
        { upsert: true },
      );
    }
  }

  const ownerEmail = process.env.ADMIN_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.ADMIN_OWNER_PASSWORD;
  if (ownerEmail && ownerPassword) {
    const existing = await db.collection(ADMIN_COLLECTIONS.users).findOne({ email: ownerEmail });
    if (!existing) {
      const passwordHash = await bcrypt.hash(ownerPassword, 12);
      await db.collection(ADMIN_COLLECTIONS.users).insertOne({
        email: ownerEmail,
        passwordHash,
        name: process.env.ADMIN_OWNER_NAME?.trim() || 'Owner',
        roleKey: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      logger.info('Seeded default owner account', { email: ownerEmail });
    }
  }
}

export async function signAdminToken(payload: AdminJwtPayload): Promise<string> {
  const expiresIn = process.env.ADMIN_JWT_EXPIRES_IN || '7d';
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(jwtSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminJwtPayload> {
  const { payload } = await jwtVerify(token, jwtSecret());
  return payload as unknown as AdminJwtPayload;
}

export async function getPermissionAction(
  roleKey: AdminRoleKey,
  permissionKey: PermissionKey,
): Promise<PermissionAction> {
  const db = getDb();
  const row = await db.collection(ADMIN_COLLECTIONS.rolePermissions).findOne({ roleKey, permissionKey });
  return (row?.action as PermissionAction) ?? 'none';
}

export async function canAccess(
  roleKey: AdminRoleKey,
  permissionKey: PermissionKey,
  minAction: PermissionAction = 'read',
): Promise<boolean> {
  const action = await getPermissionAction(roleKey, permissionKey);
  if (action === 'none') return false;
  if (minAction === 'read') return action === 'read' || action === 'manage';
  return action === 'manage';
}

export function requirePermission(permissionKey: PermissionKey, minAction: PermissionAction = 'read') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const allowed = await canAccess(req.admin.roleKey, permissionKey, minAction);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Missing authorization token' });
      return;
    }
    const token = header.slice(7);
    const payload = await verifyAdminToken(token);
    const user = await getDb()
      .collection<AdminUserRecord>(ADMIN_COLLECTIONS.users)
      .findOne({ _id: new ObjectId(payload.sub), status: 'active' });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid session' });
      return;
    }
    req.admin = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      roleKey: user.roleKey,
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export async function loginAdmin(email: string, password: string) {
  const db = getDb();
  const user = await db.collection<AdminUserRecord>(ADMIN_COLLECTIONS.users).findOne({
    email: email.trim().toLowerCase(),
    status: 'active',
  });
  if (!user) throw new Error('Invalid email or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid email or password');

  await db.collection(ADMIN_COLLECTIONS.users).updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), updatedAt: new Date() } },
  );

  const token = await signAdminToken({
    sub: String(user._id),
    email: user.email,
    name: user.name,
    roleKey: user.roleKey,
  });

  return {
    accessToken: token,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.roleKey,
      avatar: user.avatarUrl,
      lastLogin: new Date().toISOString(),
    },
    permissions: await getRolePermissions(user.roleKey),
  };
}

export async function getRolePermissions(roleKey: AdminRoleKey): Promise<Record<string, PermissionAction>> {
  const db = getDb();
  const rows = await db.collection(ADMIN_COLLECTIONS.rolePermissions).find({ roleKey }).toArray();
  const permissions: Record<string, PermissionAction> = {};
  for (const row of rows) {
    permissions[row.permissionKey] = row.action as PermissionAction;
  }
  return permissions;
}

export async function createInvite(input: {
  email: string;
  roleKey: AdminRoleKey;
  invitedBy: string;
}) {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const doc = {
    email: input.email.trim().toLowerCase(),
    roleKey: input.roleKey,
    token,
    invitedBy: new ObjectId(input.invitedBy),
    expiresAt,
    createdAt: new Date(),
  };
  await db.collection(ADMIN_COLLECTIONS.invites).insertOne(doc);
  const inviteUrl = `${adminPanelUrl()}/accept-invite?token=${token}`;

  const inviter = await db.collection(ADMIN_COLLECTIONS.users).findOne({ _id: new ObjectId(input.invitedBy) });
  const inviterName = inviter?.name || 'NovaSafe Admin';
  const emailSent = await sendTeamInviteEmail(input.email.trim().toLowerCase(), inviteUrl, input.roleKey, inviterName);

  if (!emailSent && isEmailConfigured()) {
    throw new Error('Unable to send invite email. Check Resend configuration.');
  }

  return { token, expiresAt: expiresAt.toISOString(), inviteUrl, emailSent };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  validateNewPassword(newPassword);
  const db = getDb();
  const user = await db
    .collection<AdminUserRecord>(ADMIN_COLLECTIONS.users)
    .findOne({ _id: new ObjectId(userId), status: 'active' });
  if (!user) throw new Error('User not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.collection(ADMIN_COLLECTIONS.users).updateOne(
    { _id: user._id },
    { $set: { passwordHash, updatedAt: new Date() } },
  );
}

export async function requestPasswordReset(email: string): Promise<{ message: string; resetUrl?: string }> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const user = await db
    .collection<AdminUserRecord>(ADMIN_COLLECTIONS.users)
    .findOne({ email: normalized, status: 'active' });

  const message = 'If an account exists for this email, password reset instructions were sent.';
  if (!user) return { message };

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.collection(ADMIN_COLLECTIONS.passwordResets).deleteMany({ userId: user._id });
  await db.collection(ADMIN_COLLECTIONS.passwordResets).insertOne({
    userId: user._id,
    email: normalized,
    token,
    expiresAt,
    createdAt: new Date(),
  });

  const resetUrl = `${adminPanelUrl()}/reset-password?token=${token}`;
  const emailSent = await sendPasswordResetEmail(normalized, resetUrl);

  if (!emailSent) {
    logger.warn('Password reset email not sent', { email: normalized, emailConfigured: isEmailConfigured() });
    if (!isEmailConfigured() && (process.env.NODE_ENV !== 'production' || process.env.ADMIN_EXPOSE_RESET_URL === 'true')) {
      return { message, resetUrl };
    }
  }

  return { message };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  validateNewPassword(newPassword);
  const db = getDb();
  const record = await db.collection(ADMIN_COLLECTIONS.passwordResets).findOne({ token });
  if (!record || record.expiresAt < new Date()) {
    throw new Error('Invalid or expired reset token');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.collection(ADMIN_COLLECTIONS.users).updateOne(
    { _id: record.userId },
    { $set: { passwordHash, updatedAt: new Date() } },
  );
  await db.collection(ADMIN_COLLECTIONS.passwordResets).deleteMany({ userId: record.userId });
}

export async function getInviteByToken(token: string) {
  const db = getDb();
  const invite = await db.collection(ADMIN_COLLECTIONS.invites).findOne({ token });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invite');
  }
  const existing = await db.collection(ADMIN_COLLECTIONS.users).findOne({ email: invite.email });
  if (existing) throw new Error('An account already exists for this email');
  return {
    email: invite.email,
    roleKey: invite.roleKey as AdminRoleKey,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  validateNewPassword(input.password);
  const db = getDb();
  const invite = await db.collection(ADMIN_COLLECTIONS.invites).findOne({ token: input.token });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invite');
  }
  const existing = await db.collection(ADMIN_COLLECTIONS.users).findOne({ email: invite.email });
  if (existing) throw new Error('An account already exists for this email');

  const now = new Date();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.collection(ADMIN_COLLECTIONS.users).insertOne({
    email: invite.email,
    passwordHash,
    name: input.name.trim() || invite.email.split('@')[0],
    roleKey: invite.roleKey,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await db.collection(ADMIN_COLLECTIONS.invites).updateOne(
    { _id: invite._id },
    { $set: { acceptedAt: now } },
  );
  return loginAdmin(invite.email, input.password);
}

export async function listRolePermissionMatrix() {
  const db = getDb();
  const rows = await db.collection(ADMIN_COLLECTIONS.rolePermissions).find({}).toArray();
  const matrix: Record<string, Record<string, PermissionAction>> = {};
  for (const row of rows) {
    matrix[row.roleKey] ??= {};
    matrix[row.roleKey][row.permissionKey] = row.action;
  }
  return {
    roles: SYSTEM_ROLES,
    permissions: PERMISSION_DEFINITIONS,
    matrix,
  };
}

export async function updateRolePermission(
  roleKey: AdminRoleKey,
  permissionKey: PermissionKey,
  action: PermissionAction,
  actorRole: AdminRoleKey,
) {
  if (actorRole !== 'owner') throw new Error('Only owners can modify permissions');
  if (roleKey === 'owner') throw new Error('Owner permissions cannot be modified');
  const db = getDb();
  await db.collection(ADMIN_COLLECTIONS.rolePermissions).updateOne(
    { roleKey, permissionKey },
    { $set: { roleKey, permissionKey, action } },
    { upsert: true },
  );
}

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        name: string;
        roleKey: AdminRoleKey;
      };
    }
  }
}
