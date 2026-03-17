/**
 * Subscription / Trial access middleware
 *
 * Enforces that the current workspace has an active subscription or non-expired trial.
 * Use on vault, folder, and other feature routes that require payment/trial.
 *
 * Must run after authMiddleware and loadRBACContext (so req.rbacContext.organizationId is set).
 * Returns 402 Payment Required with code TRIAL_EXPIRED or SUBSCRIPTION_REQUIRED so frontend can show upgrade.
 */

import { Request, Response, NextFunction } from 'express';
import {
  hasActiveSubscriptionAccess,
  getSubscriptionByWorkspaceIdAnyStatus,
} from '../services/subscriptionService';
import logger from '../logger';

const isObjectIdString = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.rbacContext?.organizationId) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Workspace context required',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const workspaceId = req.rbacContext.organizationId;
    if (!isObjectIdString(workspaceId)) {
      next();
      return;
    }

    const hasAccess = await hasActiveSubscriptionAccess(workspaceId);
    if (hasAccess) {
      next();
      return;
    }

    const subscription = await getSubscriptionByWorkspaceIdAnyStatus(workspaceId);
    const trialEnd = subscription?.trialEnd || subscription?.trialEndsAt;
    const now = new Date();
    const code =
      subscription?.status === 'trialing' && trialEnd && new Date(trialEnd) < now
        ? 'TRIAL_EXPIRED'
        : 'SUBSCRIPTION_REQUIRED';

    logger.warn(
      { userId: req.user?.id, workspaceId, code, status: subscription?.status },
      'Access denied: subscription or trial required'
    );

    res.status(402).json({
      success: false,
      message: 'Subscription or trial required',
      error:
        code === 'TRIAL_EXPIRED'
          ? 'Your trial has ended. Please upgrade to continue.'
          : 'Active subscription required.',
      code,
      userMessage:
        code === 'TRIAL_EXPIRED'
          ? 'Your free trial has ended. Upgrade now to keep using NovaSafe.'
          : 'Please subscribe to access this feature.',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Subscription middleware error');
    res.status(500).json({
      success: false,
      message: 'Access check failed',
      error: error.message,
    });
  }
};
