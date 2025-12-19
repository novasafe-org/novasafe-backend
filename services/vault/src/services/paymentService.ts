/**
 * Payment Service
 * 
 * Handles payment order creation, status tracking, and processing.
 * Follows SOLID principles with single responsibility.
 */

import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IPaymentOrder, PaymentOrderStatus, PaymentType, Currency } from '../models/PaymentOrder';
import { getPaymentProvider } from './payment/paymentRouter';
import { createSubscription, getUserSubscription, renewSubscription } from './subscriptionService';
import { validateCoupon, applyCouponDiscount } from './couponService';
import { getPlanPrice, getTaxRate } from './pricingConfigService';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

export interface CreatePaymentOrderParams {
  userId: string | ObjectId;
  planId: string;
  billingPeriod: 'monthly' | 'yearly' | 'one_time';
  currency: Currency;
  couponCode?: string;
  userCountry?: string;
}

export interface ProcessPaymentCallbackParams {
  orderId: string;
  providerResponse?: Record<string, any>; // Provider-agnostic response
  // Legacy field name for backward compatibility
  payuResponse?: Record<string, string>;
}

/**
 * Generate unique order ID
 */
const generateOrderId = (): string => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `ORD_${timestamp}_${random}`.toUpperCase();
};

/**
 * Calculate pricing with tax and discounts
 */
const calculatePricing = (
  baseAmount: number,
  currency: Currency,
  discountAmount: number = 0,
  taxRate: number = 0
): { amount: number; discountAmount: number; taxAmount: number; totalAmount: number } => {
  const amount = baseAmount;
  const discount = discountAmount;
  const subtotal = Math.max(0, amount - discount);
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;

  return {
    amount,
    discountAmount: discount,
    taxAmount: Math.round(tax * 100) / 100,
    totalAmount: Math.round(total * 100) / 100,
  };
};


/**
 * Create a new payment order
 */
export const createPaymentOrder = async (
  params: CreatePaymentOrderParams,
  userEmail: string,
  userFirstName: string,
  userPhone?: string
): Promise<IPaymentOrder> => {
  try {
    const db = new Database('vault');
    const orderId = generateOrderId();
    const now = new Date();

    // Get base amount
    const baseAmount = getPlanPrice(
      params.planId as any,
      params.billingPeriod,
      params.currency
    );

    if (baseAmount <= 0) {
      throw new Error(`Invalid plan or pricing not found: ${params.planId}`);
    }

    // Validate and apply coupon if provided
    let discountAmount = 0;
    if (params.couponCode) {
      const couponValidation = await validateCoupon(
        params.couponCode,
        params.planId,
        params.billingPeriod,
        params.userId.toString()
      );

      if (couponValidation.valid && couponValidation.discount) {
        discountAmount = await applyCouponDiscount(
          params.couponCode,
          baseAmount,
          couponValidation.discount
        );
      }
    }

    // Calculate tax
    const taxRate = getTaxRate(params.currency);

    // Calculate final pricing
    const pricing = calculatePricing(baseAmount, params.currency, discountAmount, taxRate);

    // Determine payment type
    const paymentType: PaymentType =
      params.billingPeriod === 'one_time' ? 'one_time' : 'recurring';

    // Set expiry (30 minutes from now)
    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Get payment provider from config-driven routing
    const { getPaymentProvider } = await import('./payment/paymentRouter');
    const paymentProvider = getPaymentProvider(
      params.userCountry || 'IN',
      params.currency
    );

    // Create payment order document
    const paymentOrder: Omit<IPaymentOrder, '_id'> = {
      userId: new ObjectId(params.userId),
      orderId,
      planId: params.planId,
      billingPeriod: params.billingPeriod,
      paymentType,
      amount: pricing.amount,
      currency: params.currency,
      discountAmount: pricing.discountAmount,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      couponCode: params.couponCode || null,
      status: 'pending',
      errorMessage: null,
      expiresAt,
      provider: paymentProvider.provider,
      providerPaymentId: null,
      providerTransactionId: null,
      providerSignature: null,
      redirectUrl: null,
      providerCallbackData: null,
      country: params.userCountry || 'IN',
      // Legacy PayU fields (for backward compatibility)
      payuTransactionId: null,
      payuPaymentId: null,
      payuRequestHash: null,
      payuResponseHash: null,
      payuRedirectUrl: null,
      payuCallbackData: null,
      subscriptionId: null,
      createdAt: now,
      completedAt: null,
      updatedAt: now,
    };

    // Insert payment order
    const result = await db.insertOne(collection.paymentOrders, paymentOrder);

    // Create payment order via payment provider
    try {
      const providerResponse = await paymentProvider.createPaymentOrder({
        paymentOrder: { ...paymentOrder, _id: result.insertedId } as IPaymentOrder,
        userEmail,
        userFirstName,
        userPhone,
        userCountry: params.userCountry || 'IN',
      });

      // Update payment order with provider details (provider-agnostic)
      const updateData: any = {
        providerPaymentId: providerResponse.paymentId,
        providerSignature: providerResponse.requestHash,
        redirectUrl: providerResponse.redirectUrl,
        status: 'processing',
        updatedAt: new Date(),
      };

      // Legacy PayU fields (for backward compatibility)
      if (paymentProvider.provider === 'payu') {
        updateData.payuPaymentId = providerResponse.paymentId;
        updateData.payuRequestHash = providerResponse.requestHash;
        updateData.payuRedirectUrl = providerResponse.redirectUrl;
      }

      await db.updateOne(
        collection.paymentOrders,
        { _id: result.insertedId },
        { $set: updateData }
      );

      // Return updated payment order
      const updatedOrder = await db.findOne(collection.paymentOrders, {
        _id: result.insertedId,
      }) as IPaymentOrder;

      logger.info(`Created payment order ${orderId} for user ${params.userId}`);

      return updatedOrder;
    } catch (payuError: any) {
      // Update order with error
      await db.updateOne(
        collection.paymentOrders,
        { _id: result.insertedId },
        {
          $set: {
            status: 'failed',
            errorMessage: payuError.message,
            updatedAt: new Date(),
          },
        }
      );

      throw payuError;
    }
  } catch (error: any) {
    logger.error(error, 'Error creating payment order');
    throw error;
  }
};

/**
 * Get payment order by order ID
 */
export const getPaymentOrderByOrderId = async (
  orderId: string
): Promise<IPaymentOrder | null> => {
  try {
    const db = new Database('vault');
    const order = await db.findOne(collection.paymentOrders, { orderId }) as IPaymentOrder | null;

    return order;
  } catch (error: any) {
    logger.error(error, 'Error fetching payment order');
    throw error;
  }
};

/**
 * Process payment callback from payment provider
 * Supports Razorpay, PayU, and other providers via abstraction
 */
export const processPaymentCallback = async (
  params: ProcessPaymentCallbackParams
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> => {
  try {
    const db = new Database('vault');

    // Get payment order
    const paymentOrder = await getPaymentOrderByOrderId(params.orderId);
    if (!paymentOrder) {
      throw new Error('Payment order not found');
    }

    // Get payment provider (use stored provider or detect from order)
    const { getPaymentProvider } = await import('./payment/paymentRouter');
    const paymentProvider = getPaymentProvider(
      paymentOrder.country || 'IN',
      paymentOrder.currency
    );

    // Use providerResponse if available, otherwise fallback to payuResponse (legacy)
    const providerResponse = params.providerResponse || params.payuResponse || {};

    const verification = await paymentProvider.verifyPayment({
      paymentOrder,
      providerResponse,
    });

    if (!verification.verified) {
      // Update order as failed
      await db.updateOne(
        collection.paymentOrders,
        { orderId: params.orderId },
        {
          $set: {
            status: 'failed',
            errorMessage: 'Payment verification failed',
            providerCallbackData: verification.transactionDetails,
            updatedAt: new Date(),
          },
        }
      );

      return { success: false, error: 'Payment verification failed' };
    }

    // Payment successful - update order
    const now = new Date();
    
    // Extract provider-specific transaction details
    const updateData: any = {
      status: 'completed',
      providerCallbackData: verification.transactionDetails,
      completedAt: now,
      updatedAt: now,
    };

    // Set provider-specific fields based on provider type
    if (paymentOrder.provider === 'razorpay') {
      updateData.providerTransactionId = verification.providerTransactionId;
      updateData.providerSignature = providerResponse.razorpay_signature || verification.providerTransactionId;
    } else if (paymentOrder.provider === 'payu') {
      // Legacy PayU fields
      updateData.payuTransactionId = providerResponse.txnid;
      updateData.payuResponseHash = providerResponse.hash;
      updateData.payuCallbackData = verification.transactionDetails;
      // Also set provider-agnostic fields
      updateData.providerTransactionId = providerResponse.txnid;
      updateData.providerSignature = providerResponse.hash;
    }

    await db.updateOne(
      collection.paymentOrders,
      { orderId: params.orderId },
      { $set: updateData }
    );

    // Create or update subscription
    let subscriptionId: string | null = null;

    if (paymentOrder.paymentType === 'recurring') {
      // Check if user already has an active subscription
      const existingSubscription = await getUserSubscription(paymentOrder.userId.toString());

      if (existingSubscription) {
        // Renew existing subscription
        const renewed = await renewSubscription(
          existingSubscription._id!.toString(),
          paymentOrder._id!.toString()
        );
        subscriptionId = renewed?._id?.toString() || null;
      } else {
        // Create new subscription
        const subscription = await createSubscription({
          userId: paymentOrder.userId.toString(),
          planId: paymentOrder.planId as any,
          billingPeriod: paymentOrder.billingPeriod,
          paymentOrderId: paymentOrder._id!.toString(),
          trialDays: 0, // No trial for paid plans
        });
        subscriptionId = subscription._id?.toString() || null;
      }
    } else {
      // One-time payment - create subscription
      const subscription = await createSubscription({
        userId: paymentOrder.userId.toString(),
        planId: paymentOrder.planId as any,
        billingPeriod: 'one_time',
        paymentOrderId: paymentOrder._id!.toString(),
        trialDays: 0,
      });
      subscriptionId = subscription._id?.toString() || null;
    }

    // Update payment order with subscription ID
    if (subscriptionId) {
      await db.updateOne(
        collection.paymentOrders,
        { orderId: params.orderId },
        {
          $set: {
            subscriptionId: new ObjectId(subscriptionId),
            updatedAt: new Date(),
          },
        }
      );
    }

    logger.info(`Payment completed for order ${params.orderId}, subscription: ${subscriptionId}`);

    return { success: true, subscriptionId: subscriptionId || undefined };
  } catch (error: any) {
    logger.error(error, 'Error processing payment callback');
    return { success: false, error: error.message };
  }
};

/**
 * Get payment status
 */
export const getPaymentStatus = async (
  orderId: string
): Promise<{ status: PaymentOrderStatus; order?: IPaymentOrder }> => {
  try {
    const order = await getPaymentOrderByOrderId(orderId);
    if (!order) {
      throw new Error('Payment order not found');
    }

    return {
      status: order.status,
      order,
    };
  } catch (error: any) {
    logger.error(error, 'Error fetching payment status');
    throw error;
  }
};

