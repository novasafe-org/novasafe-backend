/**
 * Billing Service
 * 
 * Handles subscription lifecycle management with Razorpay:
 * - Start free trial with payment method
 * - Get subscription status
 * - Update payment method
 * - Cancel subscription
 * - Restore subscription on app launch
 * 
 * Production-grade, enterprise-ready billing system.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG, getTrialEndDate, getTrialDurationLabel } from '../../config/config';
import { ISubscription, SubscriptionStatus, BillingPeriod } from '../models/Subscription';
import { IPaymentOrder } from '../models/PaymentOrder';
import { getPaymentProvider } from './payment/paymentRouter';
import { createSubscription, getUserSubscription, updateSubscription, getSubscriptionById } from './subscriptionService';
import { getPlanPrice } from './pricingConfigService';
import { razorpayProvider } from './payment/providers/razorpayProvider';
import { activityLogService } from './activityLogService';
import logger from '../logger';
import axios from 'axios';

const collection = DBCONFIG.vault.collections;

export interface StartTrialParams {
  userId: string | ObjectId;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  userEmail: string;
  userName: string;
  userPhone?: string;
}

export interface StartTrialResponse {
  subscriptionId: string;
  checkoutData: {
    subscriptionId: string;
    keyId: string;
  };
  trialEndsAt: Date;
  status: SubscriptionStatus;
}

export interface SubscriptionDetails {
  subscriptionId: string;
  planId: string;
  billingCycle: BillingPeriod;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  paymentMethodAdded: boolean;
  paymentMethod?: {
    last4?: string;
    brand?: string;
    type?: 'card' | 'upi' | 'netbanking' | 'wallet';
  } | null;
  daysRemaining?: number;
}

/**
 * Start a 30-day free trial with payment method required
 * Creates Razorpay subscription with trial period
 * No money is charged during trial - only authorization
 */
export const startTrial = async (
  params: StartTrialParams
): Promise<StartTrialResponse> => {
  try {
    const db = new Database('vault');
    const userId = new ObjectId(params.userId);
    const currency = params.currency || 'INR';
    const now = new Date();
    const trialEndsAt = getTrialEndDate(now);

    // Check if user already has an active subscription
    const existingSubscription = await getUserSubscription(userId);
    if (existingSubscription && (existingSubscription.status === 'active' || existingSubscription.status === 'trialing')) {
      throw new Error('User already has an active subscription or trial');
    }

    // Get plan price
    const planPrice = getPlanPrice(
      params.planId as any,
      params.billingCycle,
      currency
    );

    if (planPrice <= 0) {
      throw new Error(`Invalid plan or pricing not found: ${params.planId}`);
    }

    // Create a payment order for tracking (status: pending, will be updated when subscription is created)
    const orderId = `TRIAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const paymentOrder: Omit<IPaymentOrder, '_id'> = {
      userId,
      orderId,
      planId: params.planId,
      billingPeriod: params.billingCycle,
      paymentType: 'recurring',
      amount: planPrice,
      currency,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: planPrice,
      couponCode: null,
      status: 'pending',
      errorMessage: null,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes
      provider: 'razorpay',
      providerPaymentId: null,
      providerTransactionId: null,
      providerSignature: null,
      redirectUrl: null,
      providerCallbackData: null,
      country: 'IN',
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

    const orderResult = await db.insertOne(collection.paymentOrders, paymentOrder);
    const paymentOrderWithId = { ...paymentOrder, _id: orderResult.insertedId } as IPaymentOrder;

    // Create Razorpay subscription with trial (duration from config: TRIAL_DAYS or TRIAL_MINUTES)
    const { getTrialDurationSeconds } = await import('../../config/config');
    const subscriptionResponse = await razorpayProvider.createRecurringSubscription({
      paymentOrder: paymentOrderWithId,
      userEmail: params.userEmail,
      userFirstName: params.userName,
      userPhone: params.userPhone,
      billingCycle: params.billingCycle,
      trialDurationSeconds: getTrialDurationSeconds(),
    });

    const { getDefaultWorkspaceIdForUser } = await import('./workspaceService');
    const workspaceId = await getDefaultWorkspaceIdForUser(params.userId.toString());
    const subscription = await createSubscription({
      userId,
      workspaceId,
      planId: params.planId as any,
      billingPeriod: params.billingCycle,
      paymentOrderId: orderResult.insertedId.toString(),
      trialEndDate: trialEndsAt,
      provider: 'razorpay',
      providerSubscriptionId: subscriptionResponse.subscriptionId,
      providerCustomerId: subscriptionResponse.providerMetadata?.razorpayCustomerId || null,
      providerCustomerToken: subscriptionResponse.customerToken,
      paymentMethodAdded: false,
    });

    // Update subscription with trial end date
    await updateSubscription(subscription._id!.toString(), {
      trialEnd: trialEndsAt,
      trialEndsAt: trialEndsAt,
    });

    // Update payment order with subscription ID
    await db.updateOne(
      collection.paymentOrders,
      { _id: orderResult.insertedId },
      {
        $set: {
          subscriptionId: subscription._id,
          providerPaymentId: subscriptionResponse.subscriptionId,
          status: 'processing',
          updatedAt: new Date(),
        },
      }
    );

    logger.info(`Started ${getTrialDurationLabel()} trial for user ${userId}, subscription: ${subscriptionResponse.subscriptionId}`);

    // Log trial started (non-blocking)
    try {
      const user = await db.findOne(collection.vaultUsers, { _id: userId }) as any;
      if (user && user.companyName) {
        await activityLogService.logEvent({
          organizationId: user.companyName,
          actorUserId: userId.toString(),
          actorEmail: params.userEmail,
          actorRole: ((user.role || 'member').toLowerCase() === 'admin' || (user.role || 'member').toLowerCase() === 'super-admin') ? 'admin' : 'member',
          targetType: 'subscription',
          targetId: subscription._id?.toString() || null,
          action: 'TRIAL_STARTED',
          description: `Started ${getTrialDurationLabel()} free trial for ${params.planId} plan (${params.billingCycle})`,
          metadata: {
            planId: params.planId,
            billingCycle: params.billingCycle,
            trialDuration: getTrialDurationLabel(),
            currency,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log trial started: ${logError.message}`);
    }

    return {
      subscriptionId: subscriptionResponse.subscriptionId,
      checkoutData: subscriptionResponse.checkoutData!,
      trialEndsAt,
      status: 'trialing',
    };
  } catch (error: any) {
    logger.error(error, 'Error starting trial');
    throw new Error(`Failed to start trial: ${error.message}`);
  }
};

/**
 * Get current subscription details
 * Returns subscription status, trial info, and days remaining
 */
/**
 * Fetch payment method details from Razorpay payment/invoice
 * NOTE: Razorpay only exposes payment method details AFTER first payment
 * Before first payment, we must rely on stored details from webhooks
 * 
 * @param razorpaySubscriptionId - Razorpay subscription ID
 * @returns Payment method details or null if no payment found
 */
const fetchPaymentMethodFromRazorpay = async (
  razorpaySubscriptionId: string
): Promise<{
  last4?: string;
  brand?: string;
  type?: 'card' | 'upi' | 'netbanking' | 'wallet';
} | null> => {
  try {
    const { RAZORPAY_CONFIG } = await import('../../config/config');
    const auth = Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');

    // Fetch recent payments for this subscription
    // Only works AFTER first payment has been made
    const paymentsResponse = await axios.get(
      `https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}/payments`,
      {
        headers: { 'Authorization': `Basic ${auth}` },
        params: { count: 1 },
      }
    );

    const payments = paymentsResponse.data.items || [];
    if (payments.length > 0) {
      const payment = payments[0];
      
      // Extract payment method details from payment object
      if (payment.method === 'card' && payment.card) {
        return {
          last4: payment.card.last4 || undefined,
          brand: payment.card.network || payment.card.type || undefined,
          type: 'card',
        };
      } else if (payment.method === 'upi') {
        return {
          brand: 'UPI',
          type: 'upi',
          // Note: UPI VPA is available but we don't store it for privacy
        };
      } else if (payment.method === 'netbanking') {
        return {
          brand: payment.bank || 'Net Banking',
          type: 'netbanking',
        };
      } else if (payment.method === 'wallet') {
        return {
          brand: payment.wallet || 'Wallet',
          type: 'wallet',
        };
      }
    }
    
    // No payments found - this is normal during trial period
    logger.info(
      { razorpaySubscriptionId },
      'No payments found for subscription (normal during trial)'
    );
    return null;
  } catch (error: any) {
    logger.warn(
      { 
        error: error.message,
        razorpaySubscriptionId 
      },
      'Could not fetch payment method from Razorpay payments'
    );
    return null;
  }
};

export const getSubscriptionDetails = async (
  userId: string | ObjectId
): Promise<SubscriptionDetails | null> => {
  try {
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      return null;
    }

    // Calculate days remaining
    let daysRemaining: number | undefined;
    const now = new Date();
    
    if (subscription.status === 'trialing' && subscription.trialEnd) {
      const diff = subscription.trialEnd.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    } else if (subscription.status === 'active' && subscription.currentPeriodEnd) {
      const diff = subscription.currentPeriodEnd.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // Build payment method details
    let paymentMethod: { last4?: string; brand?: string; type?: 'card' | 'upi' | 'netbanking' | 'wallet' } | null = null;
    
    // If subscription has a Razorpay subscription ID, check Razorpay to sync payment method status
    // This handles cases where webhook didn't fire or database wasn't updated
    if (subscription.providerSubscriptionId && !subscription.paymentMethodAdded) {
      logger.info(
        { razorpaySubscriptionId: subscription.providerSubscriptionId },
        'Payment method not marked as added in DB, checking Razorpay subscription status'
      );
      
      try {
        const { RAZORPAY_CONFIG } = await import('../../config/config');
        const auth = Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');
        
        // Check Razorpay subscription status
        const subscriptionResponse = await axios.get(
          `https://api.razorpay.com/v1/subscriptions/${subscription.providerSubscriptionId}`,
          {
            headers: { 'Authorization': `Basic ${auth}` },
          }
        );

        const razorpaySub = subscriptionResponse.data;
        
        logger.info(
          {
            razorpaySubscriptionId: subscription.providerSubscriptionId,
            razorpayStatus: razorpaySub.status,
            razorpayCustomerId: razorpaySub.customer_id,
          },
          'Fetched Razorpay subscription status'
        );
        
        // If subscription is in 'authenticated' or 'active' state, payment method has been added
        // Also check if subscription has been charged (has payments) which indicates payment method exists
        const hasPaymentMethod = ['authenticated', 'active', 'trialing'].includes(razorpaySub.status) ||
                                 razorpaySub.customer_id; // If customer_id exists, payment method was added
        
        if (hasPaymentMethod) {
          logger.info(
            { 
              razorpaySubscriptionId: subscription.providerSubscriptionId,
              status: razorpaySub.status,
              customerId: razorpaySub.customer_id,
            },
            'Razorpay subscription has payment method, updating database'
          );
          
          // Mark payment method as added (we know it exists because subscription is authenticated/active)
          // Payment method details should already be stored from webhook, but try to fetch from payment if available
          // NOTE: Razorpay only exposes payment method details AFTER first payment
          // During trial, we rely on stored details from payment.authorized webhook
          
          const { updateSubscription } = await import('./subscriptionService');
          
          // Try to fetch payment method details from first payment (only works after first charge)
          const razorpayPaymentMethod = await fetchPaymentMethodFromRazorpay(subscription.providerSubscriptionId);
          
          // Update subscription to mark payment method as added
          // Use payment method details from payment if available, otherwise keep existing stored details
          const updateData: any = {
            paymentMethodAdded: true,
          };
          
          // Only update payment method details if we got them from payment
          // Otherwise, keep what's already stored (from webhook)
          if (razorpayPaymentMethod) {
            updateData.paymentMethodLast4 = razorpayPaymentMethod.last4 || null;
            updateData.paymentMethodBrand = razorpayPaymentMethod.brand || null;
            updateData.paymentMethodType = razorpayPaymentMethod.type || null;
          }
          
          await updateSubscription(subscription._id!.toString(), updateData);
          
          // Update local subscription object for this request
          subscription.paymentMethodAdded = true;
          if (razorpayPaymentMethod) {
            subscription.paymentMethodLast4 = razorpayPaymentMethod.last4 || null;
            subscription.paymentMethodBrand = razorpayPaymentMethod.brand || null;
            subscription.paymentMethodType = razorpayPaymentMethod.type || null;
            paymentMethod = razorpayPaymentMethod;
          } else if (subscription.paymentMethodLast4 || subscription.paymentMethodBrand) {
            // Use stored details if available
            paymentMethod = {
              last4: subscription.paymentMethodLast4 || undefined,
              brand: subscription.paymentMethodBrand || undefined,
              type: subscription.paymentMethodType || undefined,
            };
          }
          
          logger.info(
            {
              razorpaySubscriptionId: subscription.providerSubscriptionId,
              paymentMethodFromPayment: !!razorpayPaymentMethod,
              paymentMethodFromStored: !!(subscription.paymentMethodLast4 || subscription.paymentMethodBrand),
              paymentMethodLast4: razorpayPaymentMethod?.last4 || subscription.paymentMethodLast4,
              paymentMethodBrand: razorpayPaymentMethod?.brand || subscription.paymentMethodBrand,
              paymentMethodType: razorpayPaymentMethod?.type || subscription.paymentMethodType,
            },
            'Synced payment method status from Razorpay'
          );
        } else {
          logger.info(
            {
              razorpaySubscriptionId: subscription.providerSubscriptionId,
              status: razorpaySub.status,
            },
            'Razorpay subscription does not have payment method yet'
          );
        }
      } catch (error: any) {
        logger.error(
          { 
            error: error.message,
            errorResponse: error.response?.data,
            razorpaySubscriptionId: subscription.providerSubscriptionId 
          },
          'Could not sync payment method status from Razorpay'
        );
      }
    }
    
    if (subscription.paymentMethodAdded) {
      logger.info(
        {
          subscriptionId: subscription._id?.toString(),
          hasStoredDetails: !!(subscription.paymentMethodLast4 || subscription.paymentMethodBrand || subscription.paymentMethodType),
          hasProviderSubscriptionId: !!subscription.providerSubscriptionId,
          storedLast4: subscription.paymentMethodLast4,
          storedBrand: subscription.paymentMethodBrand,
          storedType: subscription.paymentMethodType,
        },
        'Building payment method details for subscription'
      );

      // If we have stored payment method details, use them
      if (subscription.paymentMethodLast4 || subscription.paymentMethodBrand || subscription.paymentMethodType) {
        paymentMethod = {
          last4: subscription.paymentMethodLast4 || undefined,
          brand: subscription.paymentMethodBrand || undefined,
          type: subscription.paymentMethodType || undefined,
        };
        logger.info({ paymentMethod }, 'Using stored payment method details');
      } else if (subscription.providerSubscriptionId) {
        // If payment method is added but details not stored, try to fetch from Razorpay payment
        // NOTE: This only works AFTER first payment. During trial, details should come from webhook.
        logger.info(
          { razorpaySubscriptionId: subscription.providerSubscriptionId },
          'Payment method added but details not stored, checking Razorpay payments (only works after first charge)'
        );
        const razorpayPaymentMethod = await fetchPaymentMethodFromRazorpay(subscription.providerSubscriptionId);
        if (razorpayPaymentMethod) {
          paymentMethod = razorpayPaymentMethod;
          logger.info({ paymentMethod }, 'Fetched payment method details from Razorpay payment');
          // Update subscription with payment method details for future use
          const { updateSubscription } = await import('./subscriptionService');
          await updateSubscription(subscription._id!.toString(), {
            paymentMethodLast4: razorpayPaymentMethod.last4 || null,
            paymentMethodBrand: razorpayPaymentMethod.brand || null,
            paymentMethodType: razorpayPaymentMethod.type || null,
          });
          logger.info('Updated subscription with payment method details from payment');
        } else {
          logger.warn(
            { 
              razorpaySubscriptionId: subscription.providerSubscriptionId,
              note: 'No payment found - this is normal during trial. Payment method details should come from webhook.'
            },
            'Could not fetch payment method details from Razorpay payment'
          );
        }
      } else {
        logger.warn('Payment method added but no providerSubscriptionId to fetch details');
      }
    }

    return {
      subscriptionId: subscription._id!.toString(),
      planId: subscription.planId,
      billingCycle: subscription.billingPeriod,
      status: subscription.status,
      trialEndsAt: subscription.trialEnd || subscription.trialEndsAt || null,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      paymentMethodAdded: subscription.paymentMethodAdded || false,
      paymentMethod,
      daysRemaining,
    };
  } catch (error: any) {
    logger.error(error, 'Error getting subscription details');
    throw error;
  }
};

/**
 * Add payment method to trial subscription
 * Creates Razorpay subscription with trial period and payment method
 */
export const addPaymentMethodToTrial = async (
  userId: string | ObjectId,
  subscriptionId: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{ checkoutData: { subscriptionId: string; keyId: string } }> => {
  try {
    const db = new Database('vault');
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId.toString()) {
      throw new Error('Subscription does not belong to user');
    }

    // If Razorpay subscription already exists, use update flow
    if (subscription.providerSubscriptionId) {
      const { RAZORPAY_CONFIG } = await import('../../config/config');
      return {
        checkoutData: {
          subscriptionId: subscription.providerSubscriptionId,
          keyId: RAZORPAY_CONFIG.keyId,
        },
      };
    }

    // Get user info for Razorpay
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
    }) as any;

    if (!user) {
      throw new Error('User not found');
    }

    // Calculate remaining trial days (from subscription end; fallback to config default)
    const now = new Date();
    const trialEnd = subscription.trialEnd || subscription.trialEndsAt;
    const { getTrialDays } = await import('../../config/config');
    let remainingTrialDays = Math.max(1, Math.ceil(getTrialDays()));
    if (trialEnd) {
      const diff = trialEnd.getTime() - now.getTime();
      remainingTrialDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // Get plan price
    const { getPlanPrice } = await import('./pricingConfigService');
    const planPrice = getPlanPrice(
      subscription.planId as any,
      billingCycle,
      'INR'
    );

    if (planPrice <= 0) {
      throw new Error(`Invalid plan or pricing not found: ${subscription.planId}`);
    }

    // Create payment order for tracking
    const orderId = `PAYMENT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentOrder: Omit<IPaymentOrder, '_id'> = {
      userId: new ObjectId(userId),
      orderId,
      planId: subscription.planId,
      billingPeriod: billingCycle,
      paymentType: 'recurring',
      amount: planPrice,
      currency: 'INR',
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: planPrice,
      couponCode: null,
      status: 'pending',
      errorMessage: null,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      provider: 'razorpay',
      providerPaymentId: null,
      providerTransactionId: null,
      providerSignature: null,
      redirectUrl: null,
      providerCallbackData: null,
      country: 'IN',
      payuTransactionId: null,
      payuPaymentId: null,
      payuRequestHash: null,
      payuResponseHash: null,
      payuRedirectUrl: null,
      payuCallbackData: null,
      subscriptionId: subscription._id,
      createdAt: now,
      completedAt: null,
      updatedAt: now,
    };

    const orderResult = await db.insertOne(collection.paymentOrders, paymentOrder);
    const paymentOrderWithId = { ...paymentOrder, _id: orderResult.insertedId } as IPaymentOrder;

    // Create Razorpay subscription with remaining trial days
    const subscriptionResponse = await razorpayProvider.createRecurringSubscription({
      paymentOrder: paymentOrderWithId,
      userEmail: user.email,
      userFirstName: user.name || user.fullName || 'User',
      userPhone: user.phoneNumber,
      billingCycle,
      trialDays: remainingTrialDays,
    });

    // Update subscription with Razorpay details
    await updateSubscription(subscriptionId, {
      providerSubscriptionId: subscriptionResponse.subscriptionId,
      providerCustomerId: subscriptionResponse.providerMetadata?.razorpayCustomerId || null,
      providerCustomerToken: subscriptionResponse.customerToken,
      billingPeriod: billingCycle, // Update billing cycle if changed
    });

    // Update payment order
    await db.updateOne(
      collection.paymentOrders,
      { _id: orderResult.insertedId },
      {
        $set: {
          providerPaymentId: subscriptionResponse.subscriptionId,
          status: 'processing',
          updatedAt: new Date(),
        },
      }
    );

    logger.info(`Payment method setup initiated for trial subscription ${subscriptionId}, Razorpay subscription: ${subscriptionResponse.subscriptionId}`);

    // Log payment method added (non-blocking)
    try {
      if (user && user.companyName) {
        await activityLogService.logEvent({
          organizationId: user.companyName,
          actorUserId: userId.toString(),
          actorEmail: user.email,
          actorRole: ((user.role || 'member').toLowerCase() === 'admin' || (user.role || 'member').toLowerCase() === 'super-admin') ? 'admin' : 'member',
          targetType: 'subscription',
          targetId: subscriptionId,
          action: 'PAYMENT_METHOD_ADDED',
          description: `Added payment method to trial subscription`,
          metadata: {
            subscriptionId,
            planId: subscription.planId,
            billingCycle,
            trialDaysRemaining: remainingTrialDays,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log payment method added: ${logError.message}`);
    }

    return {
      checkoutData: {
        subscriptionId: subscriptionResponse.subscriptionId,
        keyId: subscriptionResponse.checkoutData!.keyId,
      },
    };
  } catch (error: any) {
    logger.error(error, 'Error adding payment method to trial');
    throw new Error(`Failed to add payment method: ${error.message}`);
  }
};

/**
 * Update payment method for subscription
 * Opens Razorpay checkout to update card/UPI
 */
export const updatePaymentMethod = async (
  userId: string | ObjectId,
  subscriptionId: string
): Promise<{ checkoutData: { subscriptionId: string; keyId: string } }> => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId.toString()) {
      throw new Error('Subscription does not belong to user');
    }

    // If no Razorpay subscription exists, create one (add payment method to trial)
    if (!subscription.providerSubscriptionId) {
      // Use existing billing cycle or default to monthly
      const billingCycle = subscription.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
      return await addPaymentMethodToTrial(userId, subscriptionId, billingCycle);
    }

    // Verify the Razorpay subscription exists before trying to update
    try {
      const { RAZORPAY_CONFIG } = await import('../../config/config');
      const auth = Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');
      
      const verifyResponse = await axios.get(
        `https://api.razorpay.com/v1/subscriptions/${subscription.providerSubscriptionId}`,
        {
          headers: { 'Authorization': `Basic ${auth}` },
        }
      );

      const razorpaySub = verifyResponse.data;
      
      // Check if subscription is in a state that allows payment method updates
      // Razorpay allows updating payment method for subscriptions in 'created', 'authenticated', or 'active' state
      if (!['created', 'authenticated', 'active', 'trialing'].includes(razorpaySub.status)) {
        logger.warn(
          { 
            razorpaySubscriptionId: subscription.providerSubscriptionId,
            status: razorpaySub.status 
          },
          'Subscription is not in a state that allows payment method updates'
        );
        // If subscription is in an invalid state, recreate it
        const billingCycle = subscription.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
        return await addPaymentMethodToTrial(userId, subscriptionId, billingCycle);
      }

      // Subscription exists and is in valid state, return checkout data
      // Log payment method update initiated (non-blocking)
      try {
        const db = new Database('vault');
        const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) }) as any;
        if (user && user.companyName) {
          await activityLogService.logEvent({
            organizationId: user.companyName,
            actorUserId: userId.toString(),
            actorEmail: user.email,
            actorRole: ((user.role || 'member').toLowerCase() === 'admin' || (user.role || 'member').toLowerCase() === 'super-admin') ? 'admin' : 'member',
            targetType: 'subscription',
            targetId: subscriptionId,
            action: 'PAYMENT_METHOD_ADDED',
            description: `Initiated payment method update for subscription`,
            metadata: {
              subscriptionId,
              planId: subscription.planId,
              razorpaySubscriptionId: subscription.providerSubscriptionId,
            },
          });
        }
      } catch (logError: any) {
        logger.warn(`Failed to log payment method update: ${logError.message}`);
      }

      return {
        checkoutData: {
          subscriptionId: subscription.providerSubscriptionId,
          keyId: RAZORPAY_CONFIG.keyId,
        },
      };
    } catch (error: any) {
      // If subscription doesn't exist in Razorpay, create a new one
      if (error.response?.status === 404 || error.response?.status === 400 || 
          error.response?.data?.error?.code === 'BAD_REQUEST_ERROR') {
        logger.warn(
          { 
            razorpaySubscriptionId: subscription.providerSubscriptionId,
            error: error.message,
            errorResponse: error.response?.data
          },
          'Razorpay subscription not found or invalid, creating new subscription'
        );
        // Clear the invalid providerSubscriptionId and create a new subscription
        const { updateSubscription } = await import('./subscriptionService');
        await updateSubscription(subscriptionId, {
          providerSubscriptionId: null,
          providerCustomerId: null, // Also clear customer ID as it might be invalid
        });
        
        const billingCycle = subscription.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
        return await addPaymentMethodToTrial(userId, subscriptionId, billingCycle);
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(error, 'Error updating payment method');
    throw new Error(`Failed to update payment method: ${error.message}`);
  }
};

/**
 * Cancel subscription
 * Cancels at period end, keeps access until end date
 */
export const cancelSubscription = async (
  userId: string | ObjectId,
  subscriptionId: string
): Promise<{ success: boolean; canceledAt: Date; expiresAt: Date }> => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId.toString()) {
      throw new Error('Subscription does not belong to user');
    }

    // Cancel with Razorpay
    if (subscription.providerSubscriptionId) {
      const canceled = await razorpayProvider.cancelRecurringSubscription(subscription);
      if (!canceled) {
        throw new Error('Failed to cancel subscription with Razorpay');
      }
    }

    // Update subscription in database
    const expiresAt = subscription.currentPeriodEnd;
    await updateSubscription(subscriptionId, {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      expiresAt,
    });

    logger.info(`Canceled subscription ${subscriptionId} for user ${userId}`);

    // Log subscription cancellation (non-blocking)
    try {
      const db = new Database('vault');
      const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) }) as any;
      if (user && user.companyName) {
        await activityLogService.logEvent({
          organizationId: user.companyName,
          actorUserId: userId.toString(),
          actorEmail: user.email,
          actorRole: ((user.role || 'member').toLowerCase() === 'admin' || (user.role || 'member').toLowerCase() === 'super-admin') ? 'admin' : 'member',
          targetType: 'subscription',
          targetId: subscriptionId,
          action: 'SUBSCRIPTION_CANCELLED',
          description: `Canceled subscription (will expire at period end)`,
          metadata: {
            subscriptionId,
            planId: subscription.planId,
            expiresAt: expiresAt.toISOString(),
            cancelAtPeriodEnd: true,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log subscription cancellation: ${logError.message}`);
    }

    return {
      success: true,
      canceledAt: new Date(),
      expiresAt,
    };
  } catch (error: any) {
    logger.error(error, 'Error canceling subscription');
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
};

/**
 * Restore subscription on app launch
 * Fetches subscription from DB, validates with Razorpay, syncs status if mismatch
 */
export const restoreSubscription = async (
  userId: string | ObjectId
): Promise<SubscriptionDetails | null> => {
  try {
    const subscription = await getUserSubscription(userId);
    if (!subscription || !subscription.providerSubscriptionId) {
      return null;
    }

    // Fetch subscription status from Razorpay
    const { RAZORPAY_CONFIG } = await import('../../config/config');
    const auth = Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');

    const response = await axios.get(
      `https://api.razorpay.com/v1/subscriptions/${subscription.providerSubscriptionId}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );

    const razorpaySubscription = response.data;

    // Map Razorpay status to our status
    let status: SubscriptionStatus = subscription.status;
    const razorpayStatus = razorpaySubscription.status;

    if (razorpayStatus === 'active' && subscription.status === 'trialing') {
      // Trial ended, subscription is now active
      status = 'active';
      await updateSubscription(subscription._id!.toString(), {
        status: 'active',
        paymentMethodAdded: true,
      });
    } else if (razorpayStatus === 'cancelled' || razorpayStatus === 'expired') {
      status = 'canceled';
      await updateSubscription(subscription._id!.toString(), {
        status: 'canceled',
      });
    } else if (razorpayStatus === 'pending') {
      status = 'trialing';
    }

    // Return updated subscription details
    return await getSubscriptionDetails(userId);
  } catch (error: any) {
    logger.error(error, 'Error restoring subscription');
    // Don't throw - return null if restore fails (subscription might not exist in Razorpay)
    return null;
  }
};

