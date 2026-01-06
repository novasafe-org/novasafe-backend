/**
 * Account Controller
 * 
 * Handles account-related endpoints:
 * - Get account details (profile, company info, trial status)
 */

import { Request, Response } from 'express';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IUser } from '../models/User';
import logger from '../logger';
import { ObjectId } from 'mongodb';
import { loadRBACContext } from '../middlewares/rbac';
import { addUserPermissionsToResponse } from '../utils/responseHelper';

const collection = DBCONFIG.vault.collections;

/**
 * Get current user's account details
 * @route GET /v/account
 * @access Protected (requires authentication)
 */
export const getAccountDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get user ID from auth middleware (req.user is set by authMiddleware)
    const userPayload = req.user;
    
    if (!userPayload || !userPayload.id) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'User ID not found in token',
      });
      return;
    }

    const userId = userPayload.id;

    // Load RBAC context to get user permissions
    await loadRBACContext(req, res, () => {});
    if (!req.rbacContext) {
      return; // Error response already sent by loadRBACContext
    }

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

    // Calculate trial end date (30 days from account creation)
    const createdAt = new Date(user.createdAt);
    const trialEndDate = new Date(createdAt);
    trialEndDate.setDate(trialEndDate.getDate() + 30);
    
    const now = new Date();
    const isTrialActive = now < trialEndDate;
    const daysRemaining = isTrialActive 
      ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Determine if admin console should be shown
    // Show for: family, team, business plans
    // Don't show for: individual plan
    const planId = user.planId || 'individual';
    const shouldShowAdminConsole = planId !== 'individual';
    
    // Also check if user has admin role (for additional admin features)
    const userRole = (user as any).role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'super-admin';

    // Get user permissions from RBAC context
    const userPermissions = req.rbacContext ? {
      id: req.rbacContext.userId,
      email: user.email,
      role: req.rbacContext.role,
      permissions: req.rbacContext.permissions,
    } : {
      id: userId,
      email: user.email,
      role: ((user as any).role || 'member') as any,
      permissions: [] as any[],
    };

    // Build response
    const accountData = {
      success: true,
      user: {
        id: user._id?.toString() || userId,
        name: user.name || user.email?.split('@')[0] || 'User',
        email: user.email,
        avatar: user.picture,
        role: userPermissions.role,
        permissions: userPermissions.permissions,
        companyName: user.companyName,
        companyDomain: user.companyDomain,
        phoneNumber: user.phoneNumber,
        planId: user.planId || 'individual',
        signupMethod: user.signupMethod || 'email',
        createdAt: user.createdAt 
          ? (user.createdAt instanceof Date 
              ? user.createdAt.toISOString() 
              : typeof user.createdAt === 'string' 
                ? user.createdAt 
                : new Date(user.createdAt).toISOString())
          : new Date().toISOString(),
        emailVerified: user.emailVerified || false,
        onboardingCompleted: user.onboardingCompleted || false,
      },
      company: user.companyName ? {
        name: user.companyName,
        domain: user.companyDomain,
        phoneNumber: user.phoneNumber,
      } : null,
      trial: {
        isActive: isTrialActive,
        daysRemaining,
        startDate: createdAt.toISOString(),
        endDate: trialEndDate.toISOString(),
      },
      isAdminConsole: shouldShowAdminConsole,
    };

    logger.info(`Account details fetched for userId: ${userId}`);

    // Include user permissions in response (already included in accountData.user, but ensure consistency)
    const response = addUserPermissionsToResponse(req, accountData);
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Get account details error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account details',
      error: error.message,
    });
  }
};

