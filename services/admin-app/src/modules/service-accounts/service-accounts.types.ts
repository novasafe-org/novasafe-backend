import type { ObjectId } from 'mongodb';
import type { PermissionAction, PermissionKey } from '../rbac/rbac.types';

export type ServiceAccountStatus = 'active' | 'disabled';

export interface ServiceAccountPermissionGrant {
  permissionKey: PermissionKey;
  action: PermissionAction;
}

export interface ServiceAccountDefaultAuthor {
  id: string;
  name: string;
  email?: string;
}

export interface ServiceAccountRecord {
  _id: ObjectId;
  name: string;
  description?: string;
  status: ServiceAccountStatus;
  permissions: ServiceAccountPermissionGrant[];
  defaultAuthor?: ServiceAccountDefaultAuthor;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiTokenRecord {
  _id: ObjectId;
  serviceAccountId: ObjectId;
  name: string;
  prefix: string;
  tokenHash: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdBy: ObjectId;
  createdAt: Date;
}

export interface ServiceAccountDto {
  id: string;
  name: string;
  description?: string;
  status: ServiceAccountStatus;
  permissions: ServiceAccountPermissionGrant[];
  defaultAuthor?: ServiceAccountDefaultAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface CreateApiTokenResult {
  token: string;
  tokenRecord: ApiTokenDto;
}
