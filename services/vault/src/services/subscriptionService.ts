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
  workspaceId?: string | ObjectId;
  planId: PlanId;
  billingPeriod: BillingPeriod;
  paymentOrderId?: string | ObjectId;
  /** @deprecated Prefer trialEndDate from config (getTrialEndDate). */
  trialDays?: number;
  /** When set, used as trial end; otherwise trialDays or config default is used. */
  trialEndDate?: Date;
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
  planId?: PlanId;
  billingPeriod?: BillingPeriod;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  lastPaymentOrderId?: ObjectId | string;
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

    // Set trial period: explicit trialEndDate (e.g. from getTrialEndDate()) or trialDays
    const explicitTrialEnd = params.trialEndDate;
    const trialDaysParam = params.trialDays ?? 0;
    const trialEndResolved = explicitTrialEnd
      ? explicitTrialEnd
      : trialDaysParam > 0
        ? (() => {
            const e = new Date(now);
            e.setDate(e.getDate() + trialDaysParam);
            return e;
          })()
        : null;

    if (trialEndResolved) {
      trialStart = now;
      trialEnd = trialEndResolved;
      currentPeriodEnd = new Date(trialEndResolved);
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
    if (trialEndResolved) {
      status = 'trialing';
    }

    const subscription: any = {
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
    if (params.workspaceId) subscription.workspaceId = new ObjectId(params.workspaceId);

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
 * Get active subscription for a workspace (preferred).
 * Only returns subscriptions with status 'active' or 'trialing'.
 */
export const getSubscriptionByWorkspaceId = async (
  workspaceId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const db = new Database('vault');
    const subscription = await db.findOne(collection.subscriptions, {
      workspaceId: new ObjectId(workspaceId),
      status: { $in: ['active', 'trialing'] },
    }) as ISubscription | null;
    return subscription;
  } catch (error: any) {
    logger.error(error, 'Error fetching workspace subscription');
    throw error;
  }
};

/**
 * Get subscription for a workspace regardless of status.
 * Used when upgrading after trial (update existing instead of creating duplicate).
 */
export const getSubscriptionByWorkspaceIdAnyStatus = async (
  workspaceId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const db = new Database('vault');
    const subscription = await db.findOne(collection.subscriptions, {
      workspaceId: new ObjectId(workspaceId),
    }) as ISubscription | null;
    return subscription;
  } catch (error: any) {
    logger.error(error, 'Error fetching workspace subscription (any status)');
    throw error;
  }
};

/**
 * Returns true if the workspace has an active subscription or a non-expired trial.
 * Used by requireActiveSubscription middleware to enforce access control.
 */
export const hasActiveSubscriptionAccess = async (
  workspaceId: string | ObjectId
): Promise<boolean> => {
  const subscription = await getSubscriptionByWorkspaceId(workspaceId);
  if (!subscription) return false;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'trialing') {
    const trialEnd = subscription.trialEnd || subscription.trialEndsAt;
    if (!trialEnd) return true; // no end date, allow
    return new Date(trialEnd) >= new Date();
  }
  return false;
};

/**
 * Get active subscription for a user (default workspace or legacy by userId).
 */
export const getUserSubscription = async (
  userId: string | ObjectId
): Promise<ISubscription | null> => {
  try {
    const { getDefaultWorkspaceIdForUser } = await import('./workspaceService');
    const workspaceId = await getDefaultWorkspaceIdForUser(userId.toString());
    const byWorkspace = await getSubscriptionByWorkspaceId(workspaceId);
    if (byWorkspace) return byWorkspace;
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
 * Check and update expired subscriptions (trial ended or period ended).
 * Run periodically (e.g. hourly) so status stays in sync; access is also enforced in real time by requireActiveSubscription.
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
          { trialEnd: { $lt: now } },
          { trialEndsAt: { $lt: now } },
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

