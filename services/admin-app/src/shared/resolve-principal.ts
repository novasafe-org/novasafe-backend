import type { AdminRoleKey, PermissionAction, PermissionKey } from '../modules/rbac/rbac.types';
import {
  permissionGrantsAllow,
  verifyApiToken,
  API_TOKEN_PREFIX,
} from '../modules/service-accounts/service-accounts.service';
import type { ServiceAccountPermissionGrant } from '../modules/service-accounts/service-accounts.types';

export type AuthPrincipal =
  | {
      kind: 'user';
      id: string;
      email: string;
      name: string;
      roleKey: AdminRoleKey;
    }
  | {
      kind: 'service_account';
      id: string;
      name: string;
      email: string;
      permissions: ServiceAccountPermissionGrant[];
      defaultAuthor?: { id: string; name: string; email?: string };
    };

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.trim()) return null;
  const [scheme, token] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function resolvePrincipalFromBearer(bearerToken: string): Promise<AuthPrincipal> {
  if (bearerToken.startsWith(API_TOKEN_PREFIX)) {
    const verified = await verifyApiToken(bearerToken);
    if (!verified) throw new Error('Invalid or expired API token');
    const { serviceAccount } = verified;
    const email =
      serviceAccount.defaultAuthor?.email?.trim() ||
      `service-account+${String(serviceAccount._id)}@integrations.novasafe.internal`;
    return {
      kind: 'service_account',
      id: String(serviceAccount._id),
      name: serviceAccount.name,
      email,
      permissions: serviceAccount.permissions,
      defaultAuthor: serviceAccount.defaultAuthor,
    };
  }

  const { verifyAdminToken } = await import('../modules/rbac/rbac.service');
  const { getDb, ObjectId, ADMIN_COLLECTIONS } = await import('../database/mongo');
  const payload = await verifyAdminToken(bearerToken);
  const user = await getDb()
    .collection<{ status: string; email: string; name: string; roleKey: AdminRoleKey }>(
      ADMIN_COLLECTIONS.users,
    )
    .findOne({ _id: new ObjectId(payload.sub), status: 'active' });
  if (!user) throw new Error('Invalid session');

  return {
    kind: 'user',
    id: String(payload.sub),
    email: user.email,
    name: user.name,
    roleKey: user.roleKey,
  };
}

export async function resolvePrincipalFromAuthorizationHeader(
  authorization: string | undefined,
): Promise<AuthPrincipal> {
  const token = extractBearerToken(authorization);
  if (!token) throw new Error('Missing authorization token');
  return resolvePrincipalFromBearer(token);
}

export async function principalHasPermission(
  principal: AuthPrincipal,
  permissionKey: PermissionKey,
  minAction: PermissionAction = 'read',
): Promise<boolean> {
  if (principal.kind === 'service_account') {
    return permissionGrantsAllow(principal.permissions, permissionKey, minAction);
  }
  const { canAccess } = await import('../modules/rbac/rbac.service');
  return canAccess(principal.roleKey, permissionKey, minAction);
}

export function principalToExpressAdmin(principal: AuthPrincipal) {
  if (principal.kind === 'user') {
    return {
      id: principal.id,
      email: principal.email,
      name: principal.name,
      roleKey: principal.roleKey,
      authKind: 'user' as const,
    };
  }
  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    roleKey: 'member' as AdminRoleKey,
    authKind: 'service_account' as const,
    permissions: principal.permissions,
    defaultAuthor: principal.defaultAuthor,
  };
}
