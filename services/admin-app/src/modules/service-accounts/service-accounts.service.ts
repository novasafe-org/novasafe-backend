import { createHash, randomBytes } from 'crypto';

import { ADMIN_COLLECTIONS, getDb, ObjectId } from '../../database/mongo';
import { logger } from '../../shared/logger';
import type { PermissionAction, PermissionKey } from '../rbac/rbac.types';
import type {
  ApiTokenDto,
  ApiTokenRecord,
  CreateApiTokenResult,
  ServiceAccountDefaultAuthor,
  ServiceAccountDto,
  ServiceAccountPermissionGrant,
  ServiceAccountRecord,
} from './service-accounts.types';

export const API_TOKEN_PREFIX = 'nsa_live_';

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateApiToken(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function tokenDisplayPrefix(token: string): string {
  return token.slice(0, 16);
}

function toServiceAccountDto(doc: ServiceAccountRecord): ServiceAccountDto {
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    permissions: doc.permissions,
    defaultAuthor: doc.defaultAuthor,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toApiTokenDto(doc: ApiTokenRecord): ApiTokenDto {
  return {
    id: String(doc._id),
    name: doc.name,
    prefix: doc.prefix,
    expiresAt: doc.expiresAt?.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
    revokedAt: doc.revokedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function ensureServiceAccountIndexes(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.collection(ADMIN_COLLECTIONS.serviceAccounts).createIndex({ status: 1 }),
    db.collection(ADMIN_COLLECTIONS.serviceAccounts).createIndex({ createdAt: -1 }),
    db.collection(ADMIN_COLLECTIONS.apiTokens).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.apiTokens).createIndex({ serviceAccountId: 1, revokedAt: 1 }),
    db.collection(ADMIN_COLLECTIONS.apiTokens).createIndex({ prefix: 1 }),
  ]);
}

function normalizePermissions(
  permissions: ServiceAccountPermissionGrant[],
): ServiceAccountPermissionGrant[] {
  const map = new Map<PermissionKey, PermissionAction>();
  for (const row of permissions) {
    if (row.action === 'none') continue;
    const existing = map.get(row.permissionKey);
    if (!existing || row.action === 'manage') {
      map.set(row.permissionKey, row.action);
    }
  }
  return [...map.entries()].map(([permissionKey, action]) => ({ permissionKey, action }));
}

export async function listServiceAccounts(): Promise<ServiceAccountDto[]> {
  const rows = await getDb()
    .collection<ServiceAccountRecord>(ADMIN_COLLECTIONS.serviceAccounts)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map(toServiceAccountDto);
}

export async function getServiceAccountById(id: string): Promise<ServiceAccountDto | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getDb()
    .collection<ServiceAccountRecord>(ADMIN_COLLECTIONS.serviceAccounts)
    .findOne({ _id: new ObjectId(id) });
  return doc ? toServiceAccountDto(doc) : null;
}

export async function createServiceAccount(input: {
  name: string;
  description?: string;
  permissions: ServiceAccountPermissionGrant[];
  defaultAuthor?: ServiceAccountDefaultAuthor;
  createdBy: string;
}): Promise<ServiceAccountDto> {
  const now = new Date();
  const doc: ServiceAccountRecord = {
    _id: new ObjectId(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    status: 'active',
    permissions: normalizePermissions(input.permissions),
    defaultAuthor: input.defaultAuthor,
    createdBy: new ObjectId(input.createdBy),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().collection(ADMIN_COLLECTIONS.serviceAccounts).insertOne(doc);
  logger.info('Service account created', { id: String(doc._id), name: doc.name });
  return toServiceAccountDto(doc);
}

export async function updateServiceAccount(
  id: string,
  patch: {
    name?: string;
    description?: string;
    status?: 'active' | 'disabled';
    permissions?: ServiceAccountPermissionGrant[];
    defaultAuthor?: ServiceAccountDefaultAuthor | null;
  },
): Promise<ServiceAccountDto | null> {
  if (!ObjectId.isValid(id)) return null;
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) $set.name = patch.name.trim();
  if (patch.description !== undefined) $set.description = patch.description.trim() || undefined;
  if (patch.status !== undefined) $set.status = patch.status;
  if (patch.permissions !== undefined) $set.permissions = normalizePermissions(patch.permissions);
  if (patch.defaultAuthor !== undefined) $set.defaultAuthor = patch.defaultAuthor;

  const result = await getDb()
    .collection<ServiceAccountRecord>(ADMIN_COLLECTIONS.serviceAccounts)
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set }, { returnDocument: 'after' });

  if (patch.status === 'disabled' && result) {
    await revokeAllTokensForAccount(id);
  }

  return result ? toServiceAccountDto(result) : null;
}

export async function deleteServiceAccount(id: string): Promise<boolean> {
  return (await updateServiceAccount(id, { status: 'disabled' })) !== null;
}

export async function listApiTokens(serviceAccountId: string): Promise<ApiTokenDto[]> {
  if (!ObjectId.isValid(serviceAccountId)) return [];
  const rows = await getDb()
    .collection<ApiTokenRecord>(ADMIN_COLLECTIONS.apiTokens)
    .find({ serviceAccountId: new ObjectId(serviceAccountId) })
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map(toApiTokenDto);
}

export async function createApiToken(input: {
  serviceAccountId: string;
  name: string;
  createdBy: string;
  expiresInDays?: number;
}): Promise<CreateApiTokenResult | null> {
  if (!ObjectId.isValid(input.serviceAccountId)) return null;
  const account = await getDb()
    .collection<ServiceAccountRecord>(ADMIN_COLLECTIONS.serviceAccounts)
    .findOne({ _id: new ObjectId(input.serviceAccountId), status: 'active' });
  if (!account) return null;

  const token = generateApiToken();
  const now = new Date();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

  const record: ApiTokenRecord = {
    _id: new ObjectId(),
    serviceAccountId: account._id,
    name: input.name.trim(),
    prefix: tokenDisplayPrefix(token),
    tokenHash: hashApiToken(token),
    expiresAt,
    createdBy: new ObjectId(input.createdBy),
    createdAt: now,
  };

  await getDb().collection(ADMIN_COLLECTIONS.apiTokens).insertOne(record);
  logger.info('API token created', {
    serviceAccountId: input.serviceAccountId,
    tokenId: String(record._id),
    prefix: record.prefix,
  });

  return { token, tokenRecord: toApiTokenDto(record) };
}

export async function revokeApiToken(serviceAccountId: string, tokenId: string): Promise<boolean> {
  if (!ObjectId.isValid(serviceAccountId) || !ObjectId.isValid(tokenId)) return false;
  const result = await getDb().collection(ADMIN_COLLECTIONS.apiTokens).updateOne(
    {
      _id: new ObjectId(tokenId),
      serviceAccountId: new ObjectId(serviceAccountId),
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

async function revokeAllTokensForAccount(serviceAccountId: string): Promise<void> {
  await getDb().collection(ADMIN_COLLECTIONS.apiTokens).updateMany(
    { serviceAccountId: new ObjectId(serviceAccountId), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export type VerifiedApiTokenContext = {
  tokenId: string;
  serviceAccount: ServiceAccountRecord;
};

export async function verifyApiToken(bearerToken: string): Promise<VerifiedApiTokenContext | null> {
  if (!bearerToken.startsWith(API_TOKEN_PREFIX)) return null;

  const tokenHash = hashApiToken(bearerToken);
  const tokenDoc = await getDb().collection<ApiTokenRecord>(ADMIN_COLLECTIONS.apiTokens).findOne({
    tokenHash,
    revokedAt: { $exists: false },
  });
  if (!tokenDoc) return null;
  if (tokenDoc.expiresAt && tokenDoc.expiresAt.getTime() < Date.now()) return null;

  const account = await getDb()
    .collection<ServiceAccountRecord>(ADMIN_COLLECTIONS.serviceAccounts)
    .findOne({ _id: tokenDoc.serviceAccountId, status: 'active' });
  if (!account) return null;

  await getDb()
    .collection(ADMIN_COLLECTIONS.apiTokens)
    .updateOne({ _id: tokenDoc._id }, { $set: { lastUsedAt: new Date() } });

  return { tokenId: String(tokenDoc._id), serviceAccount: account };
}

export function permissionGrantsAllow(
  permissions: ServiceAccountPermissionGrant[],
  permissionKey: PermissionKey,
  minAction: PermissionAction = 'read',
): boolean {
  const row = permissions.find((p) => p.permissionKey === permissionKey);
  const action = row?.action ?? 'none';
  if (action === 'none') return false;
  if (minAction === 'read') return action === 'read' || action === 'manage';
  return action === 'manage';
}

export function serviceAccountHasPermission(
  account: ServiceAccountRecord,
  permissionKey: PermissionKey,
  minAction: PermissionAction = 'read',
): boolean {
  return permissionGrantsAllow(account.permissions, permissionKey, minAction);
}
