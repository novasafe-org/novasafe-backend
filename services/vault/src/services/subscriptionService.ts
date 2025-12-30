/**
 * Subscription Service
 * 
 * Handles subscription creation, updates, and management.
 * Follows SOLID principles with single responsibility.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ISubscription, SubscriptionStatus, BillingPeriod, PlanId } from '../models/Subscription';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

export interface CreateSubscriptionParams {
  userId: string | ObjectId;
  planId: PlanId;
  billingPeriod: BillingPeriod;
  paymentOrderId?: string | ObjectId;
  trialDays?: number;
  isGrandfathered?: boolean;
  grandfatheredPlanId?: PlanId;
  provider?: 'razorpay' | 'payu' | 'paddle' | 'revenuecat';
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerCustomerToken?: string;
  paymentMethodAdded?: boolean;
  payuSubscriptionId?: string;
  payuCustomerToken?: string;
}

export interface UpdateSubscriptionParams {
  status?: SubscriptionStatus;
  billingPeriod?: BillingPeriod;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  expiresAt?: Date | null;
  trialEnd?: Date | null;
  trialEndsAt?: Date | null;
  paymentMethodAdded?: boolean;
  paymentMethodLast4?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodType?: 'card' | 'upi' | 'netbanking' | 'wallet' | null;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerCustomerToken?: string;
  payuSubscriptionId?: string;
  payuCustomerToken?: string;
}

/**
 * Create a new subscription for a user
 */
export const createSubscription = async (
  params: CreateSubscriptionParams
): Promise<ISubscription> => {
  try {
    const db = new Database('vault');
    const now = new Date();

    // Calculate period dates
    let currentPeriodStart = now;
    let currentPeriodEnd = new Date(now);
    let trialStart: Date | null = null;
    let trialEnd: Date | null = null;

    // Set trial period if applicable
    const trialDays = params.trialDays || 0;
    if (trialDays > 0) {
      trialStart = now;
      trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + trialDays);
      currentPeriodEnd = new Date(trialEnd);
    } else {
      // Set billing period end
      if (params.billingPeriod === 'monthly') {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      } else if (params.billingPeriod === 'yearly') {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      } else {
        // One-time payment - set to 1 year from now
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      }
    }

    // Determine initial status
    let status: SubscriptionStatus = 'active';
    if (trialDays > 0) {
      status = 'trialing';
    }

    const subscription: Omit<ISubscription, '_id'> = {
      userId: new ObjectId(params.userId),
      planId: params.planId,
      status,
      billingPeriod: params.billingPeriod,
      currentPeriodStart,
      currentPeriodEnd,
      trialStart,
      trialEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      expiresAt: null,
      isGrandfathered: params.isGrandfathered || false,
      grandfatheredPlanId: params.grandfatheredPlanId || null,
      lastPaymentOrderId: params.paymentOrderId ? new ObjectId(params.paymentOrderId) : null,
      initialPaymentOrderId: params.paymentOrderId ? new ObjectId(params.paymentOrderId) : null,
      provider: params.provider || null,
      providerSubscriptionId: params.providerSubscriptionId || null,
      providerCustomerId: params.providerCustomerId || null,
      providerCustomerToken: params.providerCustomerToken || null,
      paymentMethodAdded: params.paymentMethodAdded || false,
      payuSubscriptionId: params.payuSubscriptionId || null,
      payuCustomerToken: params.payuCustomerToken || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insertOne(collection.subscriptions, subscription);

    logger.info(`Created subscription for user ${params.userId}, plan: ${params.planId}`);

    return {
      ...subscription,
      _id: result.insertedId,
    } as ISubscription;
  } catch (error: any) {
    logger.error(error, 'Error creating subscription');
    throw error;
  }
};

/**
 * Get active subscription for a user
 */
export const getUserSubscription = async (
  userId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const db = new Database('vault');
    const subscription = await db.findOne(collection.subscriptions, {
      userId: new ObjectId(userId),
      status: { $in: ['active', 'trialing'] },
    }) as ISubscription | null;

    return subscription;
  } catch (error: any) {
    logger.error(error, 'Error fetching user subscription');
    throw error;
  }
};

/**
 * Get subscription by ID
 */
export const getSubscriptionById = async (
  subscriptionId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const db = new Database('vault');
    const subscription = await db.findOne(collection.subscriptions, {
      _id: new ObjectId(subscriptionId),
    }) as ISubscription | null;

    return subscription;
  } catch (error: any) {
    logger.error(error, 'Error fetching subscription');
    throw error;
  }
};

/**
 * Update subscription
 */
export const updateSubscription = async (
  subscriptionId: string | ObjectId,
  updates: UpdateSubscriptionParams
): Promise<ISubscription | null> => {
  try {
    const db = new Database('vault');
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    const result = await db.updateOne(
      collection.subscriptions,
      { _id: new ObjectId(subscriptionId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return null;
    }

    return await getSubscriptionById(subscriptionId);
  } catch (error: any) {
    logger.error(error, 'Error updating subscription');
    throw error;
  }
};

/**
 * Cancel subscription (marks for cancellation at period end)
 */
export const cancelSubscription = async (
  subscriptionId: string | ObjectId,
  cancelImmediately: boolean = false
): Promise<ISubscription | null> => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updates: UpdateSubscriptionParams = {
      cancelAtPeriodEnd: !cancelImmediately,
    };

    if (cancelImmediately) {
      updates.status = 'canceled';
      updates.canceledAt = new Date();
      updates.expiresAt = new Date();
    }

    return await updateSubscription(subscriptionId, updates);
  } catch (error: any) {
    logger.error(error, 'Error canceling subscription');
    throw error;
  }
};

/**
 * Renew subscription (for recurring payments)
 */
export const renewSubscription = async (
  subscriptionId: string | ObjectId,
  paymentOrderId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const now = new Date();
    let newPeriodEnd = new Date(subscription.currentPeriodEnd);

    // Calculate new period end based on billing period
    if (subscription.billingPeriod === 'monthly') {
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    } else if (subscription.billingPeriod === 'yearly') {
      newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
    }

    const updates: UpdateSubscriptionParams = {
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: newPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    };

    // Update last payment order reference
    await new Database('vault').updateOne(
      collection.subscriptions,
      { _id: new ObjectId(subscriptionId) },
      {
        $set: {
          ...updates,
          lastPaymentOrderId: new ObjectId(paymentOrderId),
          updatedAt: new Date(),
        },
      }
    );

    return await getSubscriptionById(subscriptionId);
  } catch (error: any) {
    logger.error(error, 'Error renewing subscription');
    throw error;
  }
};

/**
 * Check and update expired subscriptions
 */
export const checkExpiredSubscriptions = async (): Promise<number> => {
  try {
    const db = new Database('vault');
    const now = new Date();

    const result = await db.updateMany(
      collection.subscriptions,
      {
        status: { $in: ['active', 'trialing', 'past_due'] },
        $or: [
          { currentPeriodEnd: { $lt: now } },
          { expiresAt: { $lt: now } },
        ],
      },
      {
        $set: {
          status: 'expired',
          updatedAt: now,
        },
      }
    );

    logger.info(`Updated ${result.modifiedCount} expired subscriptions`);

    return result.modifiedCount || 0;
  } catch (error: any) {
    logger.error(error, 'Error checking expired subscriptions');
    return 0;
  }
};

