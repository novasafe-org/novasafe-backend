/**
 * Payment Controller
 * 
 * Handles HTTP requests for payment operations.
 * Follows existing controller patterns in the codebase.
 */

import { Request, Response } from 'express';
import {
  createPaymentOrder,
  getPaymentStatus,
  processPaymentCallback,
  getPaymentOrderByOrderId,
} from '../services/paymentService';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { getUserSubscription } from '../services/subscriptionService';
import { validateCoupon } from '../services/couponService';
import { IPaymentOrder } from '../models/PaymentOrder';
import logger from '../logger';

/**
 * Create a new payment order
 * 
 * @route POST /payments/create-order
 * @access Protected
 */
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { planId, period, currency, couponCode } = req.body;

    // Validate required fields
    if (!planId || !period || !currency) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'planId, period, and currency are required',
      });
      return;
    }

    // Validate period
    if (!['monthly', 'yearly', 'one_time'].includes(period)) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'Invalid period. Must be monthly, yearly, or one_time',
      });
      return;
    }

    // Validate currency (support INR for India, USD/EUR/GBP for international)
    const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
    if (!supportedCurrencies.includes(currency)) {
      res.status(400).json({
        message: 'Bad Request',
        error: `Invalid currency. Must be one of: ${supportedCurrencies.join(', ')}`,
      });
      return;
    }

    // Get user info (from request or database)
    const userEmail = req.user?.email || '';
    const userName = req.user?.name || 'User';
    const userPhone = req.body.phone; // Optional
    const userCountry = req.body.country || 'IN'; // Default to India

    // Currency validation is handled by payment provider routing
    // No need for hardcoded checks here

    // Create payment order
    const paymentOrder = await createPaymentOrder(
      {
        userId,
        planId,
        billingPeriod: period,
        currency,
        couponCode,
        userCountry,
      },
      userEmail,
      userName,
      userPhone
    );

    // Include provider-specific metadata for frontend
    const orderResponse: any = {
      orderId: paymentOrder.orderId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      totalAmount: paymentOrder.totalAmount,
      redirectUrl: paymentOrder.redirectUrl || paymentOrder.payuRedirectUrl, // Support both new and legacy fields
      provider: paymentOrder.provider,
      expiresAt: paymentOrder.expiresAt,
    };

    // Add provider-specific metadata
    if (paymentOrder.provider === 'razorpay') {
      // Include Razorpay order ID and key for SDK initialization
      orderResponse.razorpayOrderId = paymentOrder.providerPaymentId;
      orderResponse.providerPaymentId = paymentOrder.providerPaymentId; // Also include for compatibility
      orderResponse.razorpayKeyId = process.env.RAZORPAY_KEY_ID; // Frontend needs this
    }

    res.status(201).json({
      message: 'Payment order created successfully',
      order: orderResponse,
    });
  } catch (error: any) {
    logger.error(error, 'Error creating payment order');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to create payment order',
    });
  }
};

/**
 * Get payment status
 * 
 * @route GET /payments/status
 * @access Protected
 */
export const getOrderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { orderId } = req.query;

    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({
        message: 'Bad Request',
        error: 'orderId query parameter is required',
      });
      return;
    }

    const status = await getPaymentStatus(orderId);

    // Verify order belongs to user
    if (status.order && status.order.userId.toString() !== userId) {
      res.status(403).json({
        message: 'Forbidden',
        error: 'You do not have access to this payment order',
      });
      return;
    }

    res.status(200).json({
      status: {
        orderId: status.order?.orderId,
        status: status.status,
        subscriptionId: status.order?.subscriptionId,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching payment status');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch payment status',
    });
  }
};

/**
 * Handle payment success callback
 * Payment providers redirect here after successful payment
 * Supports both Razorpay and PayU (legacy)
 * 
 * @route GET/POST /payments/success
 * @access Public (Payment provider redirect)
 */
export const handlePaymentSuccess = async (req: Request, res: Response): Promise<void> => {
  try {
    // Provider response data (POST or GET)
    const providerResponse = { ...req.body, ...req.query };
    
    // Extract order identifier based on provider
    // Razorpay: razorpay_order_id or order_id
    // PayU: txnid
    const orderIdentifier = 
      providerResponse.razorpay_order_id || 
      providerResponse.order_id || 
      providerResponse.txnid;

    if (!orderIdentifier) {
      const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
      res.redirect(`${failureUrl}?error=missing_order_id`);
      return;
    }

    // Find payment order
    // Try orderId first (Razorpay), then txnid (PayU legacy)
    let paymentOrder = await getPaymentOrderByOrderId(orderIdentifier);
    
    // If not found by orderId, try finding by provider transaction ID
    if (!paymentOrder && providerResponse.razorpay_payment_id) {
      const db = new Database('vault');
      paymentOrder = await db.findOne(
        DBCONFIG.vault.collections.paymentOrders,
        { providerTransactionId: providerResponse.razorpay_payment_id }
      ) as IPaymentOrder | null;
    }

    if (!paymentOrder) {
      logger.warn(`Payment order not found for identifier: ${orderIdentifier}`);
      const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
      res.redirect(`${failureUrl}?error=order_not_found`);
      return;
    }

    // Process payment callback
    const result = await processPaymentCallback({
      orderId: paymentOrder.orderId,
      providerResponse,
    });

    if (result.success) {
      const successUrl = process.env.FRONTEND_PAYMENT_SUCCESS_URL || 'novasafe://payment/success';
      res.redirect(
        `${successUrl}?orderId=${paymentOrder.orderId}&subscriptionId=${result.subscriptionId || ''}`
      );
    } else {
      const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
      res.redirect(`${failureUrl}?orderId=${paymentOrder.orderId}&error=${encodeURIComponent(result.error || 'payment_failed')}`);
    }
  } catch (error: any) {
    logger.error(error, 'Error processing payment success callback');
    const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
    res.redirect(`${failureUrl}?error=${encodeURIComponent(error.message || 'server_error')}`);
  }
};

/**
 * Handle payment failure callback
 * Payment providers redirect here after failed payment
 * Supports both Razorpay and PayU (legacy)
 * 
 * @route GET/POST /payments/failure
 * @access Public (Payment provider redirect)
 */
export const handlePaymentFailure = async (req: Request, res: Response): Promise<void> => {
  try {
    const providerResponse = { ...req.body, ...req.query };
    
    // Extract order identifier
    const orderIdentifier = 
      providerResponse.razorpay_order_id || 
      providerResponse.order_id || 
      providerResponse.txnid;
    
    const errorMessage = providerResponse.error || providerResponse.error_description || 'Payment failed';

    if (orderIdentifier) {
      // Update payment order status
      const paymentOrder = await getPaymentOrderByOrderId(orderIdentifier);
      if (paymentOrder) {
        const db = new Database('vault');
        await db.updateOne(
          DBCONFIG.vault.collections.paymentOrders,
          { orderId: paymentOrder.orderId },
          {
            $set: {
              status: 'failed',
              errorMessage: errorMessage,
              providerCallbackData: providerResponse,
              updatedAt: new Date(),
            },
          }
        );
      }
    }

    const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
    res.redirect(`${failureUrl}?orderId=${orderIdentifier || ''}&error=${encodeURIComponent(errorMessage)}`);
  } catch (error: any) {
    logger.error(error, 'Error processing payment failure callback');
    const failureUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || 'novasafe://payment/failure';
    res.redirect(`${failureUrl}?error=${encodeURIComponent(error.message || 'server_error')}`);
  }
};

/**
 * Handle payment webhook (legacy PayU endpoint)
 * PayU sends server-to-server notifications here
 * 
 * @route POST /payments/webhook
 * @access Public (PayU webhook - legacy)
 */
export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookPayload = req.body;
    const { txnid, status, hash, ...otherData } = webhookPayload;

    logger.info(`Received PayU webhook (legacy) for txnid: ${txnid}, status: ${status}`);

    if (!txnid) {
      logger.warn('PayU webhook missing txnid');
      res.status(400).json({ message: 'Missing txnid' });
      return;
    }

    // Find payment order
    const paymentOrder = await getPaymentOrderByOrderId(txnid);
    if (!paymentOrder) {
      logger.warn(`Payment order not found for webhook txnid: ${txnid}`);
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    // Get payment provider
    const { getPaymentProvider } = await import('../services/payment/paymentRouter');
    const paymentProvider = getPaymentProvider(
      paymentOrder.country || 'IN',
      paymentOrder.currency
    );

    // Verify webhook signature if provider supports it
    if (paymentProvider.verifyWebhookSignature && hash) {
      const isValid = paymentProvider.verifyWebhookSignature(
        JSON.stringify(webhookPayload),
        hash
      );
      if (!isValid) {
        logger.warn(`Invalid webhook signature for txnid: ${txnid}`);
        res.status(400).json({ message: 'Invalid signature' });
        return;
      }
    }

    // Parse webhook payload
    let webhookData;
    if (paymentProvider.parseWebhookPayload) {
      webhookData = paymentProvider.parseWebhookPayload(webhookPayload);
    } else {
      webhookData = {
        event: status === 'success' ? 'payment.success' : 'payment.failed',
        data: webhookPayload,
        provider: 'payu',
        timestamp: new Date(),
      };
    }

    // Process payment callback
    const result = await processPaymentCallback({
      orderId: paymentOrder.orderId,
      providerResponse: webhookPayload,
    });

    // Always return 200 (even if processing failed)
    res.status(200).json({
      message: 'Webhook processed',
      success: result.success,
    });

    logger.info(`PayU webhook processed for txnid: ${txnid}, success: ${result.success}`);
  } catch (error: any) {
    logger.error(error, 'Error processing PayU webhook');
    res.status(200).json({
      message: 'Webhook received',
      error: 'Processing failed',
    });
  }
};

/**
 * Handle payment callback (legacy endpoint)
 * Supports both Razorpay and PayU
 * 
 * @route POST /payments/callback
 * @access Public (Payment provider webhook)
 */
export const handlePaymentCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, ...providerResponse } = req.body;

    if (!orderId) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'orderId is required',
      });
      return;
    }

    const result = await processPaymentCallback({
      orderId,
      providerResponse,
    });

    if (result.success) {
      res.status(200).json({
        message: 'Payment processed successfully',
        subscriptionId: result.subscriptionId,
      });
    } else {
      res.status(400).json({
        message: 'Payment processing failed',
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error(error, 'Error processing payment callback');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to process payment callback',
    });
  }
};

/**
 * Handle Razorpay webhook
 * Razorpay sends server-to-server notifications here
 * 
 * @route POST /payments/webhook/razorpay
 * @access Public (Razorpay webhook)
 */
export const handleRazorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookPayload = req.body;
    const signature = req.headers['x-razorpay-signature'] as string;

    logger.info(`Received Razorpay webhook: ${webhookPayload.event || 'unknown'}`);

    if (!signature) {
      logger.warn('Razorpay webhook missing signature');
      res.status(400).json({ message: 'Missing signature' });
      return;
    }

    // Get payment provider
    const { getPaymentProvider } = await import('../services/payment/paymentRouter');
    const paymentProvider = getPaymentProvider('GLOBAL', 'INR'); // Razorpay supports all

    // Verify webhook signature
    if (paymentProvider.verifyWebhookSignature) {
      const rawBody = JSON.stringify(webhookPayload);
      const isValid = paymentProvider.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        logger.warn(`Invalid Razorpay webhook signature`);
        res.status(400).json({ message: 'Invalid signature' });
        return;
      }
    }

    // Parse webhook payload
    let webhookData;
    if (paymentProvider.parseWebhookPayload) {
      webhookData = paymentProvider.parseWebhookPayload(webhookPayload);
    } else {
      logger.warn('Razorpay provider does not support webhook parsing');
      res.status(400).json({ message: 'Webhook parsing not supported' });
      return;
    }

    if (!webhookData) {
      logger.warn('Failed to parse Razorpay webhook payload');
      res.status(400).json({ message: 'Invalid webhook payload' });
      return;
    }

    // Extract order ID from webhook data
    let orderId: string | null = null;
    
    if (webhookData.data.payment?.entity) {
      const payment = webhookData.data.payment.entity;
      orderId = payment.notes?.orderId || null;
      
      if (!orderId && payment.order_id) {
        // Try to find order by Razorpay order ID
        const db = new Database('vault');
        const order = await db.findOne(
          DBCONFIG.vault.collections.paymentOrders,
          { providerPaymentId: payment.order_id }
        ) as IPaymentOrder | null;
        orderId = order?.orderId || null;
      }
    }

    if (!orderId) {
      logger.warn('Razorpay webhook missing order ID');
      res.status(400).json({ message: 'Missing order ID' });
      return;
    }

    // Process payment callback based on event type
    if (webhookData.event === 'payment.success' || webhookData.event === 'payment.captured') {
      const result = await processPaymentCallback({
        orderId,
        providerResponse: {
          razorpay_order_id: webhookData.data.payment?.entity?.order_id,
          razorpay_payment_id: webhookData.data.payment?.entity?.id,
          razorpay_signature: signature,
        },
      });

      res.status(200).json({
        message: 'Webhook processed',
        success: result.success,
      });

      logger.info(`Razorpay webhook processed for order: ${orderId}, success: ${result.success}`);
    } else if (webhookData.event === 'subscription.activated' || webhookData.event === 'subscription.charged') {
      // Handle subscription events
      logger.info(`Razorpay subscription event: ${webhookData.event} for order: ${orderId}`);
      res.status(200).json({ message: 'Subscription webhook processed' });
    } else {
      logger.info(`Razorpay webhook event handled: ${webhookData.event}`);
      res.status(200).json({ message: 'Webhook received' });
    }
  } catch (error: any) {
    logger.error(error, 'Error processing Razorpay webhook');
    // Always return 200 to Razorpay to prevent retries
    res.status(200).json({
      message: 'Webhook received',
      error: 'Processing failed',
    });
  }
};

/**
 * Verify payment (for frontend after Razorpay SDK payment)
 * Frontend sends payment result from Razorpay SDK for verification
 * 
 * @route POST /payments/verify
 * @access Protected
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!orderId) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'orderId is required',
      });
      return;
    }

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'Razorpay payment details are required (razorpay_payment_id, razorpay_order_id, razorpay_signature)',
      });
      return;
    }

    // Process payment callback with Razorpay response
    const result = await processPaymentCallback({
      orderId,
      providerResponse: {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      },
    });

    if (result.success) {
      res.status(200).json({
        message: 'Payment verified successfully',
        success: true,
        subscriptionId: result.subscriptionId,
      });
    } else {
      res.status(400).json({
        message: 'Payment verification failed',
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error(error, 'Error verifying payment');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to verify payment',
    });
  }
};

/**
 * Validate coupon code
 * 
 * @route POST /pricing/validate-coupon
 * @access Protected
 */
export const validateCouponCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User not authenticated',
      });
      return;
    }

    const { couponCode, planId, period } = req.body;

    if (!couponCode || !planId || !period) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'couponCode, planId, and period are required',
      });
      return;
    }

    const validation = await validateCoupon(couponCode, planId, period, userId);

    res.status(200).json({
      validation,
    });
  } catch (error: any) {
    logger.error(error, 'Error validating coupon');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to validate coupon',
    });
  }
};

