/**
 * Payment Routes
 * 
 * Handles all payment-related endpoints.
 * 
 * BASE PATH: /v/payments
 */

import express from 'express';
import { authMiddleware } from '../middlewares/auth';
import {
  createOrder,
  getOrderStatus,
  verifyPayment,
  handlePaymentCallback,
  handlePaymentSuccess,
  handlePaymentFailure,
  handlePaymentWebhook,
  handleRazorpayWebhook,
  validateCouponCode,
} from '../controllers/PaymentController';

const router = express.Router();

/**
 * @route   POST /v/payments/create-order
 * @desc    Create a new payment order
 * @access  Protected
 * 
 * REQUEST BODY:
 * {
 *   "planId": "pro",
 *   "period": "yearly",
 *   "currency": "INR",
 *   "couponCode": "WELCOME20" // optional
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Payment order created successfully",
 *   "order": {
 *     "orderId": "ORD_1234567890_abc123",
 *     "amount": 15999,
 *     "currency": "INR",
 *     "totalAmount": 18878.82,
 *     "redirectUrl": "https://secure.payu.in/...",
 *     "expiresAt": "2024-01-15T11:00:00.000Z"
 *   }
 * }
 */
router.post('/create-order', authMiddleware, createOrder);

/**
 * @route   GET /v/payments/status
 * @desc    Get payment order status
 * @access  Protected
 * 
 * QUERY PARAMS:
 * ?orderId=ORD_1234567890_abc123
 * 
 * RESPONSE:
 * {
 *   "status": {
 *     "orderId": "ORD_1234567890_abc123",
 *     "status": "completed",
 *     "subscriptionId": "507f1f77bcf86cd799439011"
 *   }
 * }
 */
router.get('/status', authMiddleware, getOrderStatus);

/**
 * @route   POST /v/payments/verify
 * @desc    Verify payment after Razorpay SDK payment completion
 * @access  Protected
 * 
 * REQUEST BODY:
 * {
 *   "orderId": "ORD_1234567890_abc123",
 *   "razorpay_payment_id": "pay_xxxxxxxxxxxxx",
 *   "razorpay_order_id": "order_xxxxxxxxxxxxx",
 *   "razorpay_signature": "abc123..."
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Payment verified successfully",
 *   "success": true,
 *   "subscriptionId": "507f1f77bcf86cd799439011"
 * }
 */
router.post('/verify', authMiddleware, verifyPayment);

/**
 * @route   GET/POST /v/payments/success
 * @desc    Handle PayU payment success redirect
 * @access  Public (PayU redirect)
 * 
 * PayU redirects here after successful payment with query params:
 * ?txnid=ORD_123&status=success&hash=abc123...
 */
router.get('/success', handlePaymentSuccess);
router.post('/success', handlePaymentSuccess);

/**
 * @route   GET/POST /v/payments/failure
 * @desc    Handle PayU payment failure redirect
 * @access  Public (PayU redirect)
 * 
 * PayU redirects here after failed payment with query params:
 * ?txnid=ORD_123&status=failure&error=...
 */
router.get('/failure', handlePaymentFailure);
router.post('/failure', handlePaymentFailure);

/**
 * @route   POST /v/payments/webhook
 * @desc    Handle PayU payment webhook (server-to-server) - Legacy endpoint
 * @access  Public (PayU webhook)
 * 
 * PayU sends server-to-server notifications here
 */
router.post('/webhook', handlePaymentWebhook);

/**
 * @route   POST /v/payments/webhook/razorpay
 * @desc    Handle Razorpay payment webhook (server-to-server)
 * @access  Public (Razorpay webhook)
 * 
 * Razorpay sends server-to-server notifications here
 * Handles: payment.captured, subscription.activated, subscription.charged, subscription.cancelled
 */
router.post('/webhook/razorpay', handleRazorpayWebhook);

/**
 * @route   POST /v/payments/callback
 * @desc    Handle PayU payment callback/webhook (legacy endpoint)
 * @access  Public (PayU webhook)
 * 
 * REQUEST BODY:
 * {
 *   "orderId": "ORD_1234567890_abc123",
 *   "txnid": "payu_txn_123",
 *   "status": "success",
 *   "hash": "abc123...",
 *   ...other PayU response fields
 * }
 */
router.post('/callback', handlePaymentCallback);

/**
 * @route   POST /v/pricing/validate-coupon
 * @desc    Validate a coupon code
 * @access  Protected
 * 
 * REQUEST BODY:
 * {
 *   "couponCode": "WELCOME20",
 *   "planId": "pro",
 *   "period": "yearly"
 * }
 * 
 * RESPONSE:
 * {
 *   "validation": {
 *     "valid": true,
 *     "discount": {
 *       "type": "percentage",
 *       "value": 20
 *     }
 *   }
 * }
 */
router.post('/validate-coupon', authMiddleware, validateCouponCode);

export default router;

