/**
 * Subscription Routes
 * 
 * Handles all subscription-related endpoints.
 * 
 * BASE PATH: /v/subscriptions
 */

import express from 'express';
import { authMiddleware } from '../middlewares/auth';
import {
  getCurrentSubscription,
  cancelCurrentSubscription,
  restorePurchases,
} from '../controllers/SubscriptionController';

const router = express.Router();

/**
 * @route   GET /v/subscriptions/me
 * @desc    Get current user's subscription
 * @access  Protected
 * 
 * RESPONSE:
 * {
 *   "subscription": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "planId": "pro",
 *     "status": "active",
 *     "billingPeriod": "yearly",
 *     "currentPeriodStart": "2024-01-15T10:00:00.000Z",
 *     "currentPeriodEnd": "2025-01-15T10:00:00.000Z",
 *     "trialStart": null,
 *     "trialEnd": null,
 *     "cancelAtPeriodEnd": false,
 *     "isGrandfathered": false,
 *     "grandfatheredPlanId": null
 *   }
 * }
 */
router.get('/me', authMiddleware, getCurrentSubscription);

/**
 * @route   POST /v/subscriptions/cancel
 * @desc    Cancel current subscription
 * @access  Protected
 * 
 * REQUEST BODY:
 * {
 *   "cancelImmediately": false // optional, defaults to false
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Subscription will cancel at period end",
 *   "subscription": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "status": "active",
 *     "cancelAtPeriodEnd": true,
 *     "expiresAt": "2025-01-15T10:00:00.000Z"
 *   }
 * }
 */
router.post('/cancel', authMiddleware, cancelCurrentSubscription);

/**
 * @route   POST /v/subscriptions/restore
 * @desc    Restore purchases (for mobile apps)
 * @access  Protected
 * 
 * RESPONSE:
 * {
 *   "message": "Purchases restored successfully",
 *   "subscription": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "planId": "pro",
 *     "status": "active",
 *     "billingPeriod": "yearly",
 *     "currentPeriodStart": "2024-01-15T10:00:00.000Z",
 *     "currentPeriodEnd": "2025-01-15T10:00:00.000Z"
 *   }
 * }
 */
router.post('/restore', authMiddleware, restorePurchases);

export default router;

