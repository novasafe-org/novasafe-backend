/**
 * RBAC Service
 * 
 * Centralized service for Role-Based Access Control operations.
 * Provides functions to check permissions, resolve user roles, and manage access.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IUser } from '../models/User';
import { IMembership } from '../models/Membership';
import { UserRole, Permission, getPermissionsForRole, roleHasPermission } from '../constants/rbac.constants';
import logger from '../logger';


const collection = DBCONFIG.vault.collections;
const isObjectIdString = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

/**
 * Get user's role in an organization
 * 
 * Priority:
 * 1. Check Membership collection (for Team/Business plans)
 * 2. Check User.role field (legacy support)
 * 3. Default to 'member' for Individual/Family plans
 */
export const getUserRole = async (
  userId: string,
  organizationIdOrWorkspaceId: string
): Promise<UserRole> => {
  try {
    const db = new Database('vault');

    const byWorkspaceId = isObjectIdString(organizationIdOrWorkspaceId);

    if (byWorkspaceId) {
      const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
        userId: new ObjectId(userId),
        $or: [
          { workspaceId: new ObjectId(organizationIdOrWorkspaceId) },
          { organizationId: organizationIdOrWorkspaceId },
        ],
        status: 'active',
      }) as IMembership | null;
      if (membership?.role) return membership.role as UserRole;

      const { getWorkspaceById } = await import('./workspaceService');
      const workspace = await getWorkspaceById(organizationIdOrWorkspaceId);
      if (workspace && workspace.ownerUserId?.toString() === userId) return UserRole.OWNER;
    } else {
      const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
        userId: new ObjectId(userId),
        organizationId: organizationIdOrWorkspaceId,
        status: 'active',
      }) as IMembership | null;
      if (membership?.role) return membership.role as UserRole;

      const user = await db.findOne(collection.vaultUsers, {
        _id: new ObjectId(userId),
        companyName: organizationIdOrWorkspaceId,
      }) as IUser | null;
      if (user && (user as any).role) {
        const role = ((user as any).role || '').toLowerCase();
        if (['owner', 'admin', 'member', 'viewer'].includes(role)) return role as UserRole;
      }
      if (organizationIdOrWorkspaceId === userId) return UserRole.OWNER;
    }

    return UserRole.MEMBER;
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationIdOrWorkspaceId }, 'Failed to get user role');
    return UserRole.VIEWER;
  }
};

/**
 * Get user's permissions in an organization
 */
export const getUserPermissions = async (
  userId: string,
  organizationId: string
): Promise<Permission[]> => {
  try {
    const role = await getUserRole(userId, organizationId);
    return getPermissionsForRole(role);
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to get user permissions');
    return [];
  }
};

/**
 * Check if user has a specific permission
 */
export const userHasPermission = async (
  userId: string,
  organizationId: string,
  permission: Permission
): Promise<boolean> => {
  try {
    const role = await getUserRole(userId, organizationId);
    return roleHasPermission(role, permission);
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId, permission }, 'Failed to check user permission');
    return false;
  }
};

/**
 * Check if user has any of the specified permissions
 */
export const userHasAnyPermission = async (
  userId: string,
  organizationId: string,
  permissions: Permission[]
): Promise<boolean> => {
  try {
    const userPermissions = await getUserPermissions(userId, organizationId);
    return permissions.some(perm => userPermissions.includes(perm));
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to check user permissions');
    return false;
  }
};

/**
 * Check if user has all of the specified permissions
 */
export const userHasAllPermissions = async (
  userId: string,
  organizationId: string,
  permissions: Permission[]
): Promise<boolean> => {
  try {
    const userPermissions = await getUserPermissions(userId, organizationId);
    return permissions.every(perm => userPermissions.includes(perm));
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to check user permissions');
    return false;
  }
};

/**
 * Create or update membership.
 * When organizationIdOrWorkspaceId is a 24-char hex string, it is stored as workspaceId and organizationId (workspace-based).
 * displayName: optional workspace-scoped display name (e.g. from invite onboarding).
 */
export const upsertMembership = async (
  userId: string,
  organizationIdOrWorkspaceId: string,
  role: UserRole,
  status: 'active' | 'invited' | 'suspended' = 'active',
  forceWorkspaceId = false,
  displayName?: string
): Promise<IMembership> => {
  try {
    const db = new Database('vault');
    const useWorkspaceId = forceWorkspaceId || isObjectIdString(organizationIdOrWorkspaceId);

    const membershipData: any = {
      userId: new ObjectId(userId),
      organizationId: organizationIdOrWorkspaceId,
      role,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (useWorkspaceId) {
      membershipData.workspaceId = new ObjectId(organizationIdOrWorkspaceId);
    }
    const displayNameTrimmed = displayName != null ? String(displayName).trim() : '';
    if (displayNameTrimmed !== '') {
      membershipData.displayName = displayNameTrimmed;
    }

    const query: any = {
      userId: new ObjectId(userId),
      ...(useWorkspaceId
        ? { $or: [{ workspaceId: new ObjectId(organizationIdOrWorkspaceId) }, { organizationId: organizationIdOrWorkspaceId }] }
        : { organizationId: organizationIdOrWorkspaceId }),
    };
    const existing = await db.findOne(collection.organizationMembers || 'organizationMembers', query) as IMembership | null;

    if (existing) {
      const updateSet: any = {
        role,
        status,
        updatedAt: new Date(),
        ...(useWorkspaceId ? { workspaceId: new ObjectId(organizationIdOrWorkspaceId), organizationId: organizationIdOrWorkspaceId } : {}),
      };
      if (displayNameTrimmed !== '') {
        updateSet.displayName = displayNameTrimmed;
      }
      await db.updateOne(
        collection.organizationMembers || 'organizationMembers',
        { _id: existing._id },
        { $set: updateSet }
      );
      logger.info({ membershipId: existing._id, displayName: displayNameTrimmed || '(unchanged)' }, 'Membership updated with workspace display name');
      return { ...existing, ...membershipData, _id: existing._id } as IMembership;
    }
    const result = await db.insertOne(collection.organizationMembers || 'organizationMembers', membershipData);
    logger.info({ membershipId: result.insertedId, displayName: displayNameTrimmed || '(none)' }, 'Membership created with workspace display name');
    return { ...membershipData, _id: result.insertedId } as IMembership;
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationIdOrWorkspaceId, role }, 'Failed to upsert membership');
    throw error;
  }
};

/**
 * Get all members of a workspace/organization (by workspace ID or legacy organizationId).
 */
export const getOrganizationMembers = async (
  organizationIdOrWorkspaceId: string
): Promise<IMembership[]> => {
  try {
    const db = new Database('vault');
    const isWsId = isObjectIdString(organizationIdOrWorkspaceId);
    const filter: any = {
      status: 'active',
      ...(isWsId
        ? { $or: [{ workspaceId: new ObjectId(organizationIdOrWorkspaceId) }, { organizationId: organizationIdOrWorkspaceId }] }
        : { organizationId: organizationIdOrWorkspaceId }),
    };
    const members = await db.getDb()
      .collection(collection.organizationMembers || 'organizationMembers')
      .find(filter)
      .toArray();
    return members as IMembership[];
  } catch (error: any) {
    logger.error({ error: error.message, organizationIdOrWorkspaceId }, 'Failed to get organization members');
    return [];
  }
};

