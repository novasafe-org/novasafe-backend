/**
 * Admin Authentication Middleware
 * 
 * Ensures that only Admin users of Teams/Business plans can access admin endpoints.
 * This middleware checks:
 * 1. User is authenticated
 * 2. User has a Team or Business plan
 * 3. User has admin role
 */

import { Request, Response, NextFunction } from 'express';
import '../middlewares/auth'; // Ensure Request type extension
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ObjectId } from 'mongodb';
import { IUser } from '../models/User';
import { ACTIVITY_LOG_SUPPORTED_PLANS, ACTIVITY_LOG_ACCESSIBLE_ROLES } from '../constants/activityLog.constants';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Admin authentication middleware
 * 
 * Verifies that the user:
 * - Is authenticated
 * - Has a Team or Business plan
 * - Has admin or super-admin role
 */
export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    // Fetch user from database
    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User account not found',
      });
      return;
    }

    // Check plan - must be team or business
    const planId = (user.planId || 'individual').toLowerCase();
    if (!ACTIVITY_LOG_SUPPORTED_PLANS.includes(planId as any)) {
      logger.warn(
        { userId, planId, supportedPlans: ACTIVITY_LOG_SUPPORTED_PLANS },
        'User attempted to access activity logs but does not have Team/Business plan'
      );
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Activity logs are only available for Team and Business plans',
        userMessage: 'This feature requires a Team or Business plan',
      });
      return;
    }

    // Check role - must be admin or super-admin
    // For Team/Business plans, if user doesn't have a role set, they're the account creator (admin by default)
    let userRole = ((user as any).role || '').toLowerCase();
    
    // If no role is set but user has Team/Business plan, they're the account creator (admin)
    if (!userRole && (planId === 'team' || planId === 'business')) {
      userRole = 'admin';
      logger.info(
        { userId, planId, note: 'User has Team/Business plan but no role set, treating as admin (account creator)' },
        'Auto-assigning admin role for Team/Business plan user'
      );
      
      // Update user in database to persist the role (non-blocking)
      db.updateOne(
        collection.vaultUsers,
        { _id: new ObjectId(userId) },
        { $set: { role: 'admin', updatedAt: new Date() } }
      ).catch((err: any) => {
        logger.warn({ error: err.message, userId }, 'Failed to update user role in database');
      });
    }
    
    // Check if role is admin or super-admin (simpler check)
    const isAdminRole = userRole === 'admin' || userRole === 'super-admin';
    if (!isAdminRole) {
      logger.warn(
        { userId, planId, userRole, hasCompanyName: !!user.companyName },
        'User attempted to access activity logs but does not have admin role'
      );
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Only administrators can access activity logs',
        userMessage: 'You must be an administrator to view activity logs',
      });
      return;
    }

    // Check organization - must have companyName for teams/business
    if (!user.companyName) {
      logger.warn(
        { userId, planId, hasCompanyName: false },
        'User attempted to access activity logs but does not have companyName set'
      );
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Organization not found',
        userMessage: 'Organization information is required for this feature',
      });
      return;
    }

    logger.info(
      { userId, planId, userRole, organizationId: user.companyName },
      'Admin access granted for activity logs'
    );

    // Attach admin context to request
    (req as any).adminContext = {
      userId: userId,
      userEmail: user.email,
      userRole: userRole,
      organizationId: user.companyName, // Use companyName as organizationId
      planId: planId,
    };

    next();
  } catch (error: any) {
    logger.error(error, 'Error in admin auth middleware');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: 'Failed to verify admin access',
    });
  }
};

