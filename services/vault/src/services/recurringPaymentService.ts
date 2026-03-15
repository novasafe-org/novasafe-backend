/**
 * Recurring Payment Service
 * 
 * Handles automatic recurring billing for subscriptions.
 * Uses PayU SI (Standing Instruction) API for recurring charges.
 */

import { getPaymentProvider } from './payment/paymentRouter';
import { getSubscriptionById } from './subscriptionService';
import { createPaymentOrder, getPaymentOrderByOrderId } from './paymentService';
import logger from '../logger';
import type { ISubscription } from '../models/Subscription';
import type { IPaymentOrder } from '../models/PaymentOrder';

/**
 * Charge a recurring subscription
 * Called by cron job or scheduler when subscription period ends
 */
export async function chargeRecurringSubscription(
  subscriptionId: string
): Promise<{ success: boolean; paymentOrderId?: string; error?: string }> {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Check if subscription is active and not canceled
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      logger.info(`Skipping charge for subscription ${subscriptionId} - status: ${subscription.status}`);
      return { success: false, error: `Subscription status is ${subscription.status}` };
    }

    // Check if subscription is set to cancel at period end
    if (subscription.cancelAtPeriodEnd) {
      logger.info(`Skipping charge for subscription ${subscriptionId} - set to cancel at period end`);
      return { success: false, error: 'Subscription set to cancel at period end' };
    }

    // Check if we have PayU customer token for recurring payments
    if (!subscription.payuCustomerToken) {
      logger.warn(`No PayU customer token for subscription ${subscriptionId} - cannot charge recurring`);
      return { success: false, error: 'No customer token available for recurring payment' };
    }

    // Get payment provider
    const paymentProvider = getPaymentProvider('IN', 'INR'); // PayU for India

    if (!paymentProvider.chargeRecurring) {
      throw new Error('Payment provider does not support recurring charges');
    }

    // Calculate amount (get from pricing config)
    const { getPlanPrice, getTaxRate } = await import('./pricingConfigService');
    const baseAmount = getPlanPrice(subscription.planId, subscription.billingPeriod, 'INR');
    const taxRate = getTaxRate('INR');
    const totalAmount = baseAmount * (1 + taxRate / 100);

    // Charge recurring payment
    logger.info(`Charging recurring payment for subscription ${subscriptionId}, amount: ${totalAmount} INR`);

    const chargeResult = await paymentProvider.chargeRecurring({
      subscription,
      amount: totalAmount,
      currency: 'INR',
    });

    if (!chargeResult.success) {
      logger.error(`Recurring charge failed for subscription ${subscriptionId}: ${chargeResult.error}`);
      return { success: false, error: chargeResult.error };
    }

    // Create payment order record for this charge
    const paymentOrder = await createPaymentOrder(
      {
        userId: subscription.userId.toString(),
        planId: subscription.planId,
        billingPeriod: subscription.billingPeriod,
        currency: 'INR',
      },
      '', // Email will be fetched from user
      '', // Name will be fetched from user
    );

    // Update payment order with transaction details
    const db = new (await import('../../database/connection')).default('vault');
    await db.updateOne(
      (await import('../../config/config')).DBCONFIG.vault.collections.paymentOrders,
      { orderId: paymentOrder.orderId },
      {
        $set: {
          status: 'completed',
          payuTransactionId: chargeResult.providerTransactionId,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // Update subscription period
    const { renewSubscription } = await import('./subscriptionService');
    await renewSubscription(subscriptionId, paymentOrder._id!.toString());

    logger.info(`Successfully charged recurring payment for subscription ${subscriptionId}`);

    return { success: true, paymentOrderId: paymentOrder.orderId };
  } catch (error: any) {
    logger.error(error, `Error charging recurring subscription ${subscriptionId}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process all due recurring subscriptions
 * Should be called by cron job daily
 */
export async function processDueRecurringSubscriptions(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    const db = new (await import('../../database/connection')).default('vault');
    const { DBCONFIG } = await import('../../config/config');
    const now = new Date();

    // Find all active subscriptions that are due for renewal
    const dueSubscriptions = await db.findMany(
      DBCONFIG.vault.collections.subscriptions,
      {
        status: { $in: ['active', 'trialing'] },
        currentPeriodEnd: { $lte: now },
        cancelAtPeriodEnd: false,
        billingPeriod: { $in: ['monthly', 'yearly'] },
      }
    ) as ISubscription[];

    logger.info(`Found ${dueSubscriptions.length} subscriptions due for renewal`);

    let succeeded = 0;
    let failed = 0;

    for (const subscription of dueSubscriptions) {
      const result = await chargeRecurringSubscription(subscription._id!.toString());
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        logger.warn(`Failed to charge subscription ${subscription._id}: ${result.error}`);
      }
    }

    return {
      processed: dueSubscriptions.length,
      succeeded,
      failed,
    };
  } catch (error: any) {
    logger.error(error, 'Error processing due recurring subscriptions');
    throw error;
  }
}


