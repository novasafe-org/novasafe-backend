/**
 * RBAC Authorization Middleware
 * 
 * Middleware functions to enforce role-based and permission-based access control.
 * All protected routes MUST use these middlewares.
 * 
 * IMPORTANT: These middlewares enforce permissions on the backend.
 * Frontend should only use permissions for UI rendering.
 */

import { Request, Response, NextFunction } from 'express';
import './auth'; // Ensure Request type extension
import { ObjectId } from 'mongodb';
import { UserRole, Permission } from '../constants/rbac.constants';
import { getUserRole, getUserPermissions, userHasPermission, userHasAnyPermission } from '../services/rbacService';
import logger from '../logger';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IUser } from '../models/User';

const collection = DBCONFIG.vault.collections;

/**
 * Extended Request interface with RBAC context
 */
declare global {
  namespace Express {
    interface Request {
      rbacContext?: {
        userId: string;
        organizationId: string;
        role: UserRole;
        permissions: Permission[];
      };
    }
  }
}

/**
 * Get organization ID from request
 * Priority:
 * 1. From req.body.organizationId
 * 2. From req.params.organizationId
 * 3. From req.query.organizationId
 * 4. From user's companyName (for Team/Business plans)
 * 5. From user's _id (for Individual/Family plans)
 */
const getOrganizationId = async (req: Request): Promise<string> => {
  // Check body, params, query
  const orgId = req.body?.organizationId || req.params?.organizationId || req.query?.organizationId;
  if (orgId) {
    return orgId as string;
  }

  // Get user from database
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const db = new Database('vault');
  const user = await db.findOne(collection.vaultUsers, {
    _id: new ObjectId(userId),
  }) as IUser | null;

  if (!user) {
    throw new Error('User not found');
  }

  // For Team/Business plans, use companyName
  if (user.companyName) {
    return user.companyName;
  }

  // For Individual/Family plans, use userId as organizationId
  return userId;
};

/**
 * Middleware to load RBAC context
 * Attaches user role and permissions to request
 */
export const loadRBACContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const organizationId = await getOrganizationId(req);
    const role = await getUserRole(userId, organizationId);
    const permissions = await getUserPermissions(userId, organizationId);

    req.rbacContext = {
      userId,
      organizationId,
      role,
      permissions,
    };

    next();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load RBAC context');
    res.status(500).json({
      success: false,
      message: 'Failed to load access control context',
      error: error.message,
    });
  }
};

/**
 * Middleware to require a specific role
 * Usage: router.get('/path', requireRole(UserRole.ADMIN), handler)
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.rbacContext) {
        await loadRBACContext(req, res, () => {});
        if (!req.rbacContext) return;
      }

      const { role } = req.rbacContext;

      if (!allowedRoles.includes(role)) {
        logger.warn({ userId: req.rbacContext.userId, role, allowedRoles }, 'Access denied: insufficient role');
        res.status(403).json({
          success: false,
          message: 'Forbidden',
          error: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
          userMessage: 'You do not have permission to perform this action',
        });
        return;
      }

      next();
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error in requireRole middleware');
      res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to require a specific permission
 * Usage: router.post('/vaults', requirePermission(Permission.VAULT_CREATE), handler)
 */
export const requirePermission = (...requiredPermissions: Permission[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.rbacContext) {
        await loadRBACContext(req, res, () => {});
        if (!req.rbacContext) return;
      }

      const { userId, organizationId, permissions } = req.rbacContext;

      // Check if user has any of the required permissions
      const hasPermission = requiredPermissions.some(perm => permissions.includes(perm));

      if (!hasPermission) {
        logger.warn({ userId, permissions, requiredPermissions }, 'Access denied: insufficient permissions');
        res.status(403).json({
          success: false,
          message: 'Forbidden',
          error: `This action requires one of the following permissions: ${requiredPermissions.join(', ')}`,
          userMessage: 'You do not have permission to perform this action',
        });
        return;
      }

      next();
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error in requirePermission middleware');
      res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to require all specified permissions
 * Usage: router.delete('/vaults/:id', requireAllPermissions(Permission.VAULT_DELETE, Permission.VAULT_UPDATE), handler)
 */
export const requireAllPermissions = (...requiredPermissions: Permission[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.rbacContext) {
        await loadRBACContext(req, res, () => {});
        if (!req.rbacContext) return;
      }

      const { userId, permissions } = req.rbacContext;

      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every(perm => permissions.includes(perm));

      if (!hasAllPermissions) {
        logger.warn({ userId, permissions, requiredPermissions }, 'Access denied: missing required permissions');
        res.status(403).json({
          success: false,
          message: 'Forbidden',
          error: `This action requires all of the following permissions: ${requiredPermissions.join(', ')}`,
          userMessage: 'You do not have permission to perform this action',
        });
        return;
      }

      next();
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error in requireAllPermissions middleware');
      res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: error.message,
      });
    }
  };
};

/**
 * Helper function to attach user permissions to response
 * Should be called in controllers before sending response
 */
export const attachUserPermissions = (req: Request): {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
} => {
  if (!req.rbacContext) {
    throw new Error('RBAC context not loaded');
  }

  // Get email from user payload or fetch from DB if needed
  const email = req.user?.email || '';

  return {
    id: req.rbacContext.userId,
    email,
    role: req.rbacContext.role,
    permissions: req.rbacContext.permissions,
  };
};

