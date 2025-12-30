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
  organizationId: string
): Promise<UserRole> => {
  try {
    const db = new Database('vault');

    // First, check Membership collection
    const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
      userId: new ObjectId(userId),
      organizationId,
      status: 'active',
    }) as IMembership | null;

    if (membership && membership.role) {
      return membership.role as UserRole;
    }

    // Fallback: Check User.role field (legacy support)
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (user && (user as any).role) {
      const role = ((user as any).role || '').toLowerCase();
      if (['owner', 'admin', 'member', 'viewer'].includes(role)) {
        return role as UserRole;
      }
    }

    // For Individual/Family plans, check if user is the owner
    const userCheck = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
    }) as IUser | null;

    if (userCheck && userCheck.companyName === organizationId) {
      // User created the organization, they are the owner
      return UserRole.OWNER;
    }

    // Default to member for Individual/Family plans
    return UserRole.MEMBER;
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to get user role');
    // Default to most restrictive role on error
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
 * Create or update membership
 */
export const upsertMembership = async (
  userId: string,
  organizationId: string,
  role: UserRole,
  status: 'active' | 'invited' | 'suspended' = 'active'
): Promise<IMembership> => {
  try {
    const db = new Database('vault');

    const membershipData: Omit<IMembership, '_id'> = {
      userId: new ObjectId(userId),
      organizationId,
      role,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if membership exists
    const existing = await db.findOne(collection.organizationMembers || 'organizationMembers', {
      userId: new ObjectId(userId),
      organizationId,
    }) as IMembership | null;

    if (existing) {
      // Update existing membership
      await db.updateOne(
        collection.organizationMembers || 'organizationMembers',
        { _id: existing._id },
        {
          $set: {
            role,
            status,
            updatedAt: new Date(),
          },
        }
      );

      return {
        ...existing,
        ...membershipData,
        _id: existing._id,
      };
    } else {
      // Create new membership
      const result = await db.insertOne(collection.organizationMembers || 'organizationMembers', membershipData);
      return {
        ...membershipData,
        _id: result.insertedId,
      };
    }
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId, role }, 'Failed to upsert membership');
    throw error;
  }
};

/**
 * Get all members of an organization
 */
export const getOrganizationMembers = async (
  organizationId: string
): Promise<IMembership[]> => {
  try {
    const db = new Database('vault');
    const members = await db.getDb()
      .collection(collection.organizationMembers || 'organizationMembers')
      .find({ organizationId, status: 'active' })
      .toArray();
    
    return members as IMembership[];
  } catch (error: any) {
    logger.error({ error: error.message, organizationId }, 'Failed to get organization members');
    return [];
  }
};

