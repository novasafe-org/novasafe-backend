/**
 * Account Controller
 * 
 * Handles account-related endpoints:
 * - Get account details (profile, company info, trial status)
 * When X-Workspace-Id is present, returns workspace-scoped plan, company name, and trial.
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
const isObjectIdString = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

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

    // RBAC context set by route middleware (loadRBACContext); ensure it exists
    if (!req.rbacContext) {
      await loadRBACContext(req, res, () => {});
      if (!req.rbacContext) return;
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

    // Resolve plan and company from current workspace when X-Workspace-Id is set
    let planId = user.planId || 'individual';
    let companyName: string | undefined = user.companyName;
    let companyDomain: string | undefined = user.companyDomain;
    let trialEndDateResolved = trialEndDate;
    let workspaceDisplayName: string | undefined;
    const orgId = req.rbacContext?.organizationId;
    if (orgId && isObjectIdString(orgId)) {
      const { getWorkspaceById } = await import('../services/workspaceService');
      const { getSubscriptionByWorkspaceId } = await import('../services/subscriptionService');
      const workspace = await getWorkspaceById(orgId);
      if (workspace) {
        companyName = workspace.name;
        planId = workspace.type as string;
        const sub = await getSubscriptionByWorkspaceId(orgId);
        if (sub) {
          planId = (sub.planId as string) || planId;
          const end = sub.trialEndsAt || sub.trialEnd || sub.currentPeriodEnd;
          if (end) trialEndDateResolved = new Date(end);
        }
      }
      const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
        userId: new ObjectId(userId),
        $or: [{ workspaceId: new ObjectId(orgId) }, { organizationId: orgId }],
        status: 'active',
      }) as { displayName?: string } | null;
      const dn = membership?.displayName;
      if (membership && dn != null && String(dn).trim() !== '') workspaceDisplayName = String(dn).trim();
    }
    const isTrialActiveResolved = now < trialEndDateResolved;
    const daysRemainingResolved = isTrialActiveResolved
      ? Math.ceil((trialEndDateResolved.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const shouldShowAdminConsole = planId !== 'individual';
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

    const baseUserName = user.name || user.email?.split('@')[0] || 'User';
    const accountData = {
      success: true,
      user: {
        id: user._id?.toString() || userId,
        name: workspaceDisplayName ?? baseUserName,
        email: user.email,
        avatar: user.picture,
        role: userPermissions.role,
        permissions: userPermissions.permissions,
        companyName: companyName ?? user.companyName,
        companyDomain: companyDomain ?? user.companyDomain,
        phoneNumber: user.phoneNumber,
        planId: planId || 'individual',
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
      company: (companyName ?? user.companyName) ? {
        name: companyName ?? user.companyName ?? '',
        domain: companyDomain ?? user.companyDomain,
        phoneNumber: user.phoneNumber,
      } : null,
      trial: {
        isActive: isTrialActiveResolved,
        daysRemaining: daysRemainingResolved,
        startDate: createdAt.toISOString(),
        endDate: trialEndDateResolved.toISOString(),
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

/**
 * Update workspace-scoped display name for the current user in the current workspace.
 * Only applies when X-Workspace-Id is set (team/business workspace).
 * @route PATCH /v/account
 */
export const updateAccountDisplayName = async (req: Request, res: Response): Promise<void> => {
  try {
    const userPayload = req.user;
    if (!userPayload?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!req.rbacContext) {
      await loadRBACContext(req, res, () => {});
      if (!req.rbacContext) return;
    }
    const orgId = req.rbacContext.organizationId;
    if (!orgId || !isObjectIdString(orgId)) {
      res.status(400).json({
        success: false,
        message: 'Workspace context required to update display name',
      });
      return;
    }
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const db = new Database('vault');
    const coll = collection.organizationMembers || 'organizationMembers';
    const result = await db.updateOne(
      coll,
      {
        userId: new ObjectId(userPayload.id),
        $or: [{ workspaceId: new ObjectId(orgId) }, { organizationId: orgId }],
        status: 'active',
      },
      { $set: { displayName, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Membership not found in this workspace',
      });
      return;
    }
    res.status(200).json({
      success: true,
      message: 'Display name updated',
      displayName: displayName || null,
    });
  } catch (error: any) {
    logger.error(`Update display name error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update display name',
      error: error.message,
    });
  }
};
