/**
 * Billing Controller
 * 
 * Handles HTTP requests for billing and subscription operations.
 * Production-grade, enterprise-ready billing API.
 */

import { Request, Response } from 'express';
// Import auth middleware to ensure Request type extension is available
import '../middlewares/auth';
import {
  startTrial,
  getSubscriptionDetails,
  updatePaymentMethod,
  cancelSubscription,
  restoreSubscription,
} from '../services/billingService';
import logger from '../logger';

/**
 * Start a 30-day free trial with payment method required
 * 
 * @route POST /billing/start-trial
 * @access Protected
 */
export const startTrialController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { planId, billingCycle, currency } = req.body;

    // Validate required fields
    if (!planId || !billingCycle) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'planId and billingCycle are required',
        userMessage: 'Please select a plan and billing cycle',
      });
      return;
    }

    // Validate billing cycle
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Invalid billingCycle. Must be monthly or yearly',
        userMessage: 'Invalid billing cycle selected',
      });
      return;
    }

    // Get user info
    const userEmail = req.user?.email || '';
    const userName = req.user?.name || 'User';
    const userPhone = req.body.phone; // Optional

    // Start trial
    const result = await startTrial({
      userId,
      planId,
      billingCycle,
      currency: currency || 'INR',
      userEmail,
      userName,
      userPhone,
    });

    res.status(201).json({
      success: true,
      message: 'Trial started successfully',
      data: {
        subscriptionId: result.subscriptionId,
        checkoutData: result.checkoutData,
        trialEndsAt: result.trialEndsAt,
        status: result.status,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error starting trial');
    
    // Handle specific error cases
    if (error.message.includes('already has an active')) {
      res.status(409).json({
        success: false,
        message: 'Conflict',
        error: error.message,
        userMessage: 'You already have an active subscription or trial',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to start trial',
      userMessage: 'Failed to start trial. Please try again.',
    });
  }
};

/**
 * Get current subscription details
 * 
 * @route GET /billing/subscription
 * @access Protected
 */
export const getSubscriptionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const subscription = await getSubscriptionDetails(userId);

    if (!subscription) {
      res.status(200).json({
        success: true,
        message: 'No active subscription',
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Subscription details retrieved',
      data: subscription,
    });
  } catch (error: any) {
    logger.error(error, 'Error getting subscription details');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to get subscription details',
      userMessage: 'Failed to load subscription details. Please try again.',
    });
  }
};

/**
 * Add or update payment method for subscription
 * For trial subscriptions without payment method, creates Razorpay subscription
 * For existing subscriptions, updates payment method
 * 
 * @route POST /billing/update-payment-method
 * @access Protected
 */
export const updatePaymentMethodController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { subscriptionId, billingCycle } = req.body;

    if (!subscriptionId) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'subscriptionId is required',
        userMessage: 'Subscription ID is required',
      });
      return;
    }

    // If billingCycle is provided and subscription doesn't have Razorpay subscription yet,
    // use addPaymentMethodToTrial, otherwise use updatePaymentMethod
    const { getSubscriptionById } = await import('../services/subscriptionService');
    const subscription = await getSubscriptionById(subscriptionId);
    
    if (!subscription) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: 'Subscription not found',
        userMessage: 'Subscription not found',
      });
      return;
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Subscription does not belong to user',
        userMessage: 'You do not have access to this subscription',
      });
      return;
    }

    let result;
    
    // If no Razorpay subscription exists and billingCycle is provided, add payment method
    if (!subscription.providerSubscriptionId && billingCycle) {
      const { addPaymentMethodToTrial } = await import('../services/billingService');
      result = await addPaymentMethodToTrial(userId, subscriptionId, billingCycle);
    } else {
      result = await updatePaymentMethod(userId, subscriptionId);
    }

    res.status(200).json({
      success: true,
      message: subscription.providerSubscriptionId 
        ? 'Payment method update initiated' 
        : 'Payment method setup initiated',
      data: result,
    });
  } catch (error: any) {
    logger.error(error, 'Error updating payment method');
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: error.message,
        userMessage: 'Subscription not found',
      });
      return;
    }

    if (error.message.includes('does not belong')) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: error.message,
        userMessage: 'You do not have access to this subscription',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to update payment method',
      userMessage: 'Failed to add payment method. Please try again.',
    });
  }
};

/**
 * Cancel subscription
 * 
 * @route POST /billing/cancel-subscription
 * @access Protected
 */
export const cancelSubscriptionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'subscriptionId is required',
        userMessage: 'Subscription ID is required',
      });
      return;
    }

    const result = await cancelSubscription(userId, subscriptionId);

    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully',
      data: result,
    });
  } catch (error: any) {
    logger.error(error, 'Error canceling subscription');
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: error.message,
        userMessage: 'Subscription not found',
      });
      return;
    }

    if (error.message.includes('does not belong')) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: error.message,
        userMessage: 'You do not have access to this subscription',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to cancel subscription',
      userMessage: 'Failed to cancel subscription. Please try again.',
    });
  }
};

/**
 * Restore subscription on app launch
 * 
 * @route POST /billing/restore
 * @access Protected
 */
export const restoreSubscriptionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const subscription = await restoreSubscription(userId);

    res.status(200).json({
      success: true,
      message: 'Subscription restored',
      data: subscription,
    });
  } catch (error: any) {
    logger.error(error, 'Error restoring subscription');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to restore subscription',
      userMessage: 'Failed to restore subscription. Please try again.',
    });
  }
};

