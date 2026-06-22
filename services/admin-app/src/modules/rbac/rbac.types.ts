export type AdminRoleKey = 'owner' | 'admin' | 'member';

export type PermissionAction = 'manage' | 'read' | 'none';

export type PermissionKey =
  | 'rbac.manage'
  | 'users.manage'
  | 'users.read'
  | 'billing.manage'
  | 'billing.read'
  | 'content.manage'
  | 'content.read'
  | 'changelog.manage'
  | 'changelog.read'
  | 'docs.manage'
  | 'announcements.manage'
  | 'support.manage'
  | 'analytics.read'
  | 'security.manage'
  | 'security.read'
  | 'system.manage'
  | 'system.read'
  | 'audit.read'
  | 'settings.manage'
  | 'settings.read'
  | 'integrations.manage';

export interface AdminUserRecord {
  _id: import('mongodb').ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  roleKey: AdminRoleKey;
  status: 'active' | 'invited' | 'suspended';
  avatarUrl?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminRoleRecord {
  _id: import('mongodb').ObjectId;
  key: AdminRoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPermissionRecord {
  _id: import('mongodb').ObjectId;
  key: PermissionKey;
  module: string;
  label: string;
  description?: string;
}

export interface AdminRolePermissionRecord {
  _id: import('mongodb').ObjectId;
  roleKey: AdminRoleKey;
  permissionKey: PermissionKey;
  action: PermissionAction;
}

export interface AdminInviteRecord {
  _id: import('mongodb').ObjectId;
  email: string;
  roleKey: AdminRoleKey;
  token: string;
  invitedBy: import('mongodb').ObjectId;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

export interface AdminPasswordResetRecord {
  _id: import('mongodb').ObjectId;
  userId: import('mongodb').ObjectId;
  email: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ChangelogReleaseRecord {
  _id: import('mongodb').ObjectId;
  version: string;
  title: string;
  category: 'feature' | 'security' | 'bugfix';
  summary: string;
  notes: string[];
  publishedAt: Date;
  isPublic: boolean;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminJwtPayload {
  sub: string;
  email: string;
  roleKey: AdminRoleKey;
  name: string;
}
