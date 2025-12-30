/**
 * Payment Provider Types
 * 
 * Common interfaces and types for payment provider abstraction.
 */

import { IPaymentOrder } from '../../models/PaymentOrder';
import { ISubscription } from '../../models/Subscription';

/**
 * Payment provider identifier
 */
export type PaymentProvider = 'razorpay' | 'payu' | 'paddle' | 'revenuecat';

/**
 * Country code (ISO 3166-1 alpha-2)
 */
export type CountryCode = string;

/**
 * Currency code (ISO 4217)
 */
export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

/**
 * Payment order creation request
 */
export interface CreatePaymentOrderRequest {
  paymentOrder: IPaymentOrder;
  userEmail: string;
  userFirstName: string;
  userPhone?: string;
  userCountry?: CountryCode;
}

/**
 * Payment order creation response
 */
export interface CreatePaymentOrderResponse {
  paymentId: string;
  redirectUrl: string;
  requestHash: string;
  providerMetadata?: Record<string, any>;
}

/**
 * Payment verification request
 */
export interface VerifyPaymentRequest {
  paymentOrder: IPaymentOrder;
  providerResponse: Record<string, any>;
}

/**
 * Payment verification response
 */
export interface VerifyPaymentResponse {
  verified: boolean;
  status: 'success' | 'failed' | 'pending';
  transactionDetails: Record<string, any>;
  providerTransactionId?: string;
}

/**
 * Recurring subscription creation request
 */
export interface CreateRecurringSubscriptionRequest {
  paymentOrder: IPaymentOrder;
  userEmail: string;
  userFirstName: string;
  userPhone?: string;
  billingCycle: 'monthly' | 'yearly';
  trialDays?: number; // Optional trial period in days
}

/**
 * Recurring subscription creation response
 */
export interface CreateRecurringSubscriptionResponse {
  subscriptionId: string;
  customerToken: string;
  checkoutData?: {
    subscriptionId: string;
    keyId: string; // Razorpay key ID for frontend SDK
  };
  providerMetadata?: Record<string, any>;
}

/**
 * Recurring charge request
 */
export interface ChargeRecurringRequest {
  subscription: ISubscription;
  amount: number;
  currency: CurrencyCode;
}

/**
 * Recurring charge response
 */
export interface ChargeRecurringResponse {
  success: boolean;
  transactionId: string;
  providerTransactionId?: string;
  error?: string;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'payment.pending'
  | 'subscription.created'
  | 'subscription.charge.success'
  | 'subscription.charge.failed'
  | 'subscription.canceled'
  | 'subscription.renewed';

/**
 * Webhook payload
 */
export interface WebhookPayload {
  event: WebhookEventType;
  data: Record<string, any>;
  provider: PaymentProvider;
  timestamp: Date;
  signature?: string;
}

/**
 * Payment provider interface
 * All payment providers must implement this interface
 */
export interface IPaymentProvider {
  /**
   * Provider identifier
   */
  readonly provider: PaymentProvider;

  /**
   * Supported countries
   */
  readonly supportedCountries: CountryCode[];

  /**
   * Supported currencies
   */
  readonly supportedCurrencies: CurrencyCode[];

  /**
   * Check if provider supports given country and currency
   */
  supports(country: CountryCode, currency: CurrencyCode): boolean;

  /**
   * Create a payment order
   */
  createPaymentOrder(
    request: CreatePaymentOrderRequest
  ): Promise<CreatePaymentOrderResponse>;

  /**
   * Verify payment status
   */
  verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse>;

  /**
   * Create recurring subscription
   */
  createRecurringSubscription?(
    request: CreateRecurringSubscriptionRequest
  ): Promise<CreateRecurringSubscriptionResponse>;

  /**
   * Charge recurring subscription
   */
  chargeRecurring?(
    request: ChargeRecurringRequest
  ): Promise<ChargeRecurringResponse>;

  /**
   * Cancel recurring subscription
   */
  cancelRecurringSubscription?(
    subscription: ISubscription
  ): Promise<boolean>;

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature?(
    payload: string,
    signature: string
  ): boolean;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload?(
    rawPayload: Record<string, any>
  ): WebhookPayload | null;
}


