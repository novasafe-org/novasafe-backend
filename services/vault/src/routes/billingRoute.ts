/**
 * Billing Routes
 * 
 * Handles all billing and subscription-related endpoints.
 * 
 * BASE PATH: /v/billing
 */

import express from 'express';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';
import {
  startTrialController,
  getSubscriptionController,
  updatePaymentMethodController,
  cancelSubscriptionController,
  restoreSubscriptionController,
} from '../controllers/BillingController';
import {
  listInvoicesController,
  getInvoiceController,
  downloadInvoiceController,
} from '../controllers/InvoiceController';

const router = express.Router();

/**
 * @route   POST /v/billing/start-trial
 * @desc    Start a 30-day free trial with payment method required
 * @access  Protected
 * 
 * REQUEST BODY:
 * {
 *   "planId": "individual",
 *   "billingCycle": "monthly",
 *   "currency": "INR" // optional, defaults to INR
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Trial started successfully",
 *   "data": {
 *     "subscriptionId": "sub_xxxxxxxxxxxxx",
 *     "checkoutData": {
 *       "subscriptionId": "sub_xxxxxxxxxxxxx",
 *       "keyId": "rzp_test_xxxxxxxxxxxxx"
 *     },
 *     "trialEndsAt": "2024-02-15T10:00:00.000Z",
 *     "status": "trialing"
 *   }
 * }
 */
router.post('/start-trial', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_UPDATE), startTrialController);

/**
 * @route   GET /v/billing/subscription
 * @desc    Get current subscription details
 * @access  Protected (requires billing:read)
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Subscription details retrieved",
 *   "data": {
 *     "subscriptionId": "507f1f77bcf86cd799439011",
 *     "planId": "individual",
 *     "billingCycle": "monthly",
 *     "status": "trialing",
 *     "trialEndsAt": "2024-02-15T10:00:00.000Z",
 *     "currentPeriodEnd": "2024-02-15T10:00:00.000Z",
 *     "paymentMethodAdded": false,
 *     "daysRemaining": 20
 *   }
 * }
 */
router.get('/subscription', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_READ), getSubscriptionController);

/**
 * @route   POST /v/billing/update-payment-method
 * @desc    Update payment method for subscription
 * @access  Protected (requires billing:update)
 * 
 * REQUEST BODY:
 * {
 *   "subscriptionId": "507f1f77bcf86cd799439011"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Payment method update initiated",
 *   "data": {
 *     "checkoutData": {
 *       "subscriptionId": "sub_xxxxxxxxxxxxx",
 *       "keyId": "rzp_test_xxxxxxxxxxxxx"
 *     }
 *   }
 * }
 */
router.post('/update-payment-method', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_UPDATE), updatePaymentMethodController);

/**
 * @route   POST /v/billing/cancel-subscription
 * @desc    Cancel subscription (cancels at period end)
 * @access  Protected (requires billing:update)
 * 
 * REQUEST BODY:
 * {
 *   "subscriptionId": "507f1f77bcf86cd799439011"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Subscription canceled successfully",
 *   "data": {
 *     "success": true,
 *     "canceledAt": "2024-01-15T10:00:00.000Z",
 *     "expiresAt": "2024-02-15T10:00:00.000Z"
 *   }
 * }
 */
router.post('/cancel-subscription', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_CANCEL), cancelSubscriptionController);

/**
 * @route   POST /v/billing/restore
 * @desc    Restore subscription on app launch
 * @access  Protected
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Subscription restored",
 *   "data": {
 *     "subscriptionId": "507f1f77bcf86cd799439011",
 *     "planId": "individual",
 *     "billingCycle": "monthly",
 *     "status": "active",
 *     "trialEndsAt": null,
 *     "currentPeriodEnd": "2024-02-15T10:00:00.000Z",
 *     "paymentMethodAdded": true,
 *     "daysRemaining": 30
 *   }
 * }
 */
router.post('/restore', authMiddleware, restoreSubscriptionController);

/**
 * @route   GET /v/billing/invoices
 * @desc    List invoices for current workspace
 * @access  Protected (billing:read), requires X-Workspace-Id
 */
router.get('/invoices', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_READ), listInvoicesController);

/**
 * @route   GET /v/billing/invoices/:id
 * @desc    Get single invoice
 * @access  Protected (billing:read)
 */
router.get('/invoices/:id', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_READ), getInvoiceController);

/**
 * @route   GET /v/billing/invoices/:id/file
 * @desc    Download invoice PDF
 * @access  Protected (billing:read)
 */
router.get('/invoices/:id/file', authMiddleware, loadRBACContext, requirePermission(Permission.BILLING_READ), downloadInvoiceController);

export default router;

