/**
 * Subscription Controller
 * 
 * Handles HTTP requests for subscription operations.
 * Follows existing controller patterns in the codebase.
 */

import { Request, Response } from 'express';
import {
  getUserSubscription,
  cancelSubscription,
  getSubscriptionById,
} from '../services/subscriptionService';
import logger from '../logger';

/**
 * Get current user's subscription
 * 
 * @route GET /subscriptions/me
 * @access Protected
 */
export const getCurrentSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const subscription = await getUserSubscription(userId);

    if (!subscription) {
      res.status(404).json({
        message: 'Not Found',
        error: 'No active subscription found',
      });
      return;
    }

    res.status(200).json({
      subscription: {
        id: subscription._id?.toString(),
        planId: subscription.planId,
        status: subscription.status,
        billingPeriod: subscription.billingPeriod,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        isGrandfathered: subscription.isGrandfathered,
        grandfatheredPlanId: subscription.grandfatheredPlanId,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching subscription');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch subscription',
    });
  }
};

/**
 * Cancel subscription
 * 
 * @route POST /subscriptions/cancel
 * @access Protected
 */
export const cancelCurrentSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { cancelImmediately } = req.body;

    const subscription = await getUserSubscription(userId);

    if (!subscription) {
      res.status(404).json({
        message: 'Not Found',
        error: 'No active subscription found',
      });
      return;
    }

    const canceled = await cancelSubscription(
      subscription._id!.toString(),
      cancelImmediately === true
    );

    if (!canceled) {
      res.status(500).json({
        message: 'Internal Server Error',
        error: 'Failed to cancel subscription',
      });
      return;
    }

    res.status(200).json({
      message: cancelImmediately
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at period end',
      subscription: {
        id: canceled._id?.toString(),
        status: canceled.status,
        cancelAtPeriodEnd: canceled.cancelAtPeriodEnd,
        expiresAt: canceled.expiresAt,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error canceling subscription');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to cancel subscription',
    });
  }
};

/**
 * Restore purchases (for mobile apps)
 * 
 * @route POST /subscriptions/restore
 * @access Protected
 */
export const restorePurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    // Get user's subscription
    const subscription = await getUserSubscription(userId);

    if (!subscription) {
      res.status(404).json({
        message: 'Not Found',
        error: 'No subscription found to restore',
      });
      return;
    }

    res.status(200).json({
      message: 'Purchases restored successfully',
      subscription: {
        id: subscription._id?.toString(),
        planId: subscription.planId,
        status: subscription.status,
        billingPeriod: subscription.billingPeriod,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error restoring purchases');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to restore purchases',
    });
  }
};

