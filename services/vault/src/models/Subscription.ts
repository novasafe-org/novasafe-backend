/**
 * Subscription Model Interface
 * 
 * Represents a user's subscription to a pricing plan.
 * Handles both recurring (monthly/yearly) and one-time payments.
 * Tracks subscription status, billing periods, and payment history.
 */

import { ObjectId } from 'mongodb';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'none';

export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

export type PlanId = 'free' | 'individual' | 'family' | 'team' | 'business';

export interface ISubscription {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * Workspace ID that owns this subscription (preferred).
   * Billing is per-workspace; one subscription per workspace.
   */
  workspaceId?: ObjectId | string;

  /**
   * User's MongoDB ObjectId who owns this subscription (legacy).
   * References the User collection. When workspaceId is set, this may be the workspace owner.
   */
  userId: ObjectId | string;

  /**
   * Plan ID that user is subscribed to
   */
  planId: PlanId;

  /**
   * Current subscription status
   */
  status: SubscriptionStatus;

  /**
   * Billing period for recurring subscriptions
   * 'one_time' for one-time payments
   */
  billingPeriod: BillingPeriod;

  // ============================================
  // Billing Period Tracking
  // ============================================

  /**
   * Start date of current billing period
   */
  currentPeriodStart: Date;

  /**
   * End date of current billing period
   * For recurring subscriptions, this is when next payment is due
   * For one-time payments, this is when subscription expires
   */
  currentPeriodEnd: Date;

  /**
   * Start date of trial period (if applicable)
   * Optional: null if no trial
   */
  trialStart?: Date | null;

  /**
   * End date of trial period (if applicable)
   * Optional: null if no trial
   */
  trialEnd?: Date | null;

  // ============================================
  // Cancellation & Renewal
  // ============================================

  /**
   * Whether subscription will cancel at end of current period
   * Default: false
   */
  cancelAtPeriodEnd: boolean;

  /**
   * Timestamp when subscription was canceled
   * Optional: null if not canceled
   */
  canceledAt?: Date | null;

  /**
   * Timestamp when subscription will expire (if canceled)
   * Optional: null if not canceled
   */
  expiresAt?: Date | null;

  // ============================================
  // Grandfathering & Legacy Plans
  // ============================================

  /**
   * Whether user is on a grandfathered plan
   * Grandfathered plans maintain old pricing
   * Default: false
   */
  isGrandfathered?: boolean;

  /**
   * Original plan ID if grandfathered
   * Optional: null if not grandfathered
   */
  grandfatheredPlanId?: PlanId | null;

  // ============================================
  // Payment Tracking
  // ============================================

  /**
   * Reference to the most recent payment order
   * References the PaymentOrder collection
   * Optional: null if no payments yet
   */
  lastPaymentOrderId?: ObjectId | string | null;

  /**
   * Reference to the initial payment order (for one-time payments)
   * References the PaymentOrder collection
   * Optional: null if recurring subscription
   */
  initialPaymentOrderId?: ObjectId | string | null;

  // ============================================
  // Payment Provider Specific Fields
  // ============================================

  /**
   * Payment provider used for this subscription
   * Determined by config-driven routing
   */
  provider?: 'razorpay' | 'payu' | 'paddle' | 'revenuecat';

  /**
   * Provider subscription ID (e.g., Razorpay subscription_id, PayU subscription_id)
   * Used to manage recurring billing with provider
   * Optional: null if one-time payment or not set up
   */
  providerSubscriptionId?: string | null;

  /**
   * Provider customer ID (e.g., Razorpay customer_id)
   * Used to link subscription to customer in payment provider
   * Optional: null if not available
   */
  providerCustomerId?: string | null;

  /**
   * Provider customer token (for recurring payments)
   * Used to store payment method for future charges
   * Optional: null if not available
   */
  providerCustomerToken?: string | null;

  /**
   * Whether payment method has been added to subscription
   * For trial subscriptions, this indicates card/UPI is saved but not charged
   * Default: false
   */
  paymentMethodAdded?: boolean;

  /**
   * Payment method details (stored after checkout)
   * Last 4 digits of card/account
   */
  paymentMethodLast4?: string | null;

  /**
   * Payment method brand (e.g., Visa, Mastercard, UPI, NetBanking)
   */
  paymentMethodBrand?: string | null;

  /**
   * Payment method type (card, upi, netbanking, wallet)
   */
  paymentMethodType?: 'card' | 'upi' | 'netbanking' | 'wallet' | null;

  /**
   * Trial end date (alias for trialEnd for clarity)
   * When trial period ends and billing starts
   * Optional: null if no trial
   */
  trialEndsAt?: Date | null;

  // ============================================
  // Legacy PayU Fields (for backward compatibility)
  // ============================================

  /**
   * @deprecated Use providerSubscriptionId instead
   * PayU subscription ID (legacy field)
   */
  payuSubscriptionId?: string | null;

  /**
   * @deprecated Use providerCustomerToken instead
   * PayU customer token (legacy field)
   */
  payuCustomerToken?: string | null;

  // ============================================
  // Timestamps
  // ============================================

  /**
   * Timestamp when subscription was created
   */
  createdAt: Date;

  /**
   * Timestamp of last update to subscription
   */
  updatedAt: Date;
}

