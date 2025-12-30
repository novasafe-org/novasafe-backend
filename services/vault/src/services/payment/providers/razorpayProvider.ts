/**
 * Razorpay Payment Provider
 * 
 * Implements Razorpay payment gateway integration.
 * Supports both one-time and recurring payments (subscriptions).
 * 
 * Documentation:
 * - https://razorpay.com/docs/api/
 * - https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/
 * - https://razorpay.com/docs/api/subscriptions/
 * - https://razorpay.com/docs/webhooks/
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { RAZORPAY_CONFIG } from '../../../../config/config';
import logger from '../../../logger';
import {
  IPaymentProvider,
  PaymentProvider,
  CreatePaymentOrderRequest,
  CreatePaymentOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  CreateRecurringSubscriptionRequest,
  CreateRecurringSubscriptionResponse,
  ChargeRecurringRequest,
  ChargeRecurringResponse,
  WebhookPayload,
  WebhookEventType,
  CountryCode,
  CurrencyCode,
} from '../types';
import type { IPaymentOrder } from '../../../models/PaymentOrder';
import type { ISubscription } from '../../../models/Subscription';

/**
 * Razorpay API Response Types
 */
interface RazorpayOrderResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

interface RazorpayPaymentResponse {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  notes: Record<string, any>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  acquirer_data: Record<string, any>;
  created_at: number;
}

interface RazorpaySubscriptionResponse {
  id: string;
  entity: string;
  plan_id: string;
  customer_id: string | null;
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired';
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, any>;
  charge_at: number;
  start_at: number;
  end_at: number;
  auth_attempts: number;
  total_count: number;
  paid_count: number;
  customer_notify: boolean;
  created_at: number;
}

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentResponse;
    };
    subscription?: {
      entity: RazorpaySubscriptionResponse;
    };
    [key: string]: any;
  };
  created_at: number;
}

/**
 * Razorpay Payment Provider Implementation
 */
class RazorpayProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'razorpay';
  readonly supportedCountries: CountryCode[] = ['IN', 'GLOBAL'];
  readonly supportedCurrencies: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP'];
  private axiosInstance: AxiosInstance;

  constructor() {
    if (!RAZORPAY_CONFIG.isValid()) {
      logger.warn('Razorpay configuration is incomplete. Payment features may not work.');
    }

    // Razorpay uses Basic Auth: key_id:key_secret
    const auth = Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');

    this.axiosInstance = axios.create({
      baseURL: RAZORPAY_CONFIG.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
    });
  }

  /**
   * Check if provider supports given country and currency
   */
  supports(country: CountryCode, currency: CurrencyCode): boolean {
    return (
      (this.supportedCountries.includes(country.toUpperCase() as CountryCode) ||
       this.supportedCountries.includes('GLOBAL')) &&
      this.supportedCurrencies.includes(currency.toUpperCase() as CurrencyCode)
    );
  }

  /**
   * Create payment order in Razorpay
   * Returns order details for frontend checkout
   */
  async createPaymentOrder(
    request: CreatePaymentOrderRequest
  ): Promise<CreatePaymentOrderResponse> {
    try {
      if (!RAZORPAY_CONFIG.isValid()) {
        throw new Error('Razorpay configuration is incomplete');
      }

      const { paymentOrder, userEmail, userFirstName, userPhone } = request;

      // Convert amount to paise (for INR) or smallest currency unit
      const amountInSmallestUnit = this.convertToSmallestUnit(
        paymentOrder.totalAmount,
        paymentOrder.currency
      );

      // Create Razorpay order
      const orderPayload = {
        amount: amountInSmallestUnit,
        currency: paymentOrder.currency,
        receipt: paymentOrder.orderId,
        notes: {
          orderId: paymentOrder.orderId,
          planId: paymentOrder.planId,
          billingPeriod: paymentOrder.billingPeriod,
          userId: paymentOrder.userId.toString(),
        },
      };

      logger.info(`Creating Razorpay order for: ${paymentOrder.orderId}`);

      const response = await this.axiosInstance.post<RazorpayOrderResponse>(
        '/v1/orders',
        orderPayload
      );

      const razorpayOrder = response.data;

      // For React Native, frontend will use Razorpay Checkout SDK
      // We return the order details needed for SDK initialization
      // redirectUrl is a fallback for web-based checkout
      const checkoutUrl = this.generateCheckoutUrl(razorpayOrder.id, {
        amount: amountInSmallestUnit,
        currency: paymentOrder.currency,
        name: 'NovaSafe',
        description: `${paymentOrder.planId} - ${paymentOrder.billingPeriod}`,
        prefill: {
          name: userFirstName,
          email: userEmail,
          contact: userPhone || '',
        },
        notes: {
          orderId: paymentOrder.orderId,
        },
      });

      return {
        paymentId: razorpayOrder.id,
        redirectUrl: checkoutUrl, // Fallback URL for web checkout
        requestHash: razorpayOrder.id, // Use order ID as hash for tracking
        providerMetadata: {
          razorpayOrderId: razorpayOrder.id,
          razorpayKeyId: RAZORPAY_CONFIG.keyId, // Frontend needs this for SDK
          amount: amountInSmallestUnit,
          currency: paymentOrder.currency,
          status: razorpayOrder.status,
        },
      };
    } catch (error: any) {
      logger.error(error, 'Error creating Razorpay payment order');
      
      if (error.response) {
        logger.error(`Razorpay API Error: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      throw new Error(`Razorpay payment order creation failed: ${error.message}`);
    }
  }

  /**
   * Verify payment status with Razorpay
   * Verifies payment signature and fetches payment details
   */
  async verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse> {
    try {
      if (!RAZORPAY_CONFIG.isValid()) {
        throw new Error('Razorpay configuration is incomplete');
      }

      const { paymentOrder, providerResponse } = request;

      // Extract Razorpay response parameters
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        ...otherParams
      } = providerResponse;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        logger.warn('Missing Razorpay verification parameters');
        return {
          verified: false,
          status: 'failed',
          transactionDetails: providerResponse,
        };
      }

      // Verify signature
      const isValidSignature = this.verifySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValidSignature) {
        logger.warn(`Razorpay signature verification failed for order: ${razorpay_order_id}`);
        return {
          verified: false,
          status: 'failed',
          transactionDetails: providerResponse,
        };
      }

      // Fetch payment details from Razorpay API
      const paymentResponse = await this.axiosInstance.get<RazorpayPaymentResponse>(
        `/v1/payments/${razorpay_payment_id}`
      );

      const payment = paymentResponse.data;
      const isVerified = payment.status === 'captured' || payment.status === 'authorized';
      const status = isVerified ? 'success' : payment.status === 'failed' ? 'failed' : 'pending';

      return {
        verified: isVerified,
        status: status as 'success' | 'failed' | 'pending',
        transactionDetails: {
          ...providerResponse,
          razorpayPayment: payment,
        },
        providerTransactionId: razorpay_payment_id,
      };
    } catch (error: any) {
      logger.error(error, 'Error verifying Razorpay payment');
      return {
        verified: false,
        status: 'failed',
        transactionDetails: request.providerResponse,
      };
    }
  }

  /**
   * Create recurring subscription in Razorpay with optional free trial
   * 
   * @param request - Subscription creation request (includes trialDays)
   * @returns Subscription details including checkout data
   */
  async createRecurringSubscription(
    request: CreateRecurringSubscriptionRequest
  ): Promise<CreateRecurringSubscriptionResponse> {
    try {
      if (!RAZORPAY_CONFIG.enableRecurring) {
        throw new Error('Recurring payments are not enabled');
      }

      if (!RAZORPAY_CONFIG.isValid()) {
        throw new Error('Razorpay configuration is incomplete');
      }

      const { paymentOrder, billingCycle, userEmail, userFirstName, userPhone, trialDays = 30 } = request;

      // First, create or get Razorpay customer
      const customerId = await this.getOrCreateCustomer({
        email: userEmail,
        name: userFirstName,
        contact: userPhone,
      });

      // Create or get Razorpay plan
      // Razorpay subscriptions require a plan_id - Plans API must be available
      const planId = await this.getOrCreatePlan(paymentOrder, billingCycle);

      // Calculate trial period
      const now = Math.floor(Date.now() / 1000); // Unix timestamp
      const trialEnd = now + (trialDays * 24 * 60 * 60); // Trial end in seconds

      // Create subscription
      // Razorpay doesn't support trial_end or charge_at fields in subscription creation
      // We'll handle the trial period in our application layer
      // For now, set start_at to trial end date so subscription starts after trial
      // This prevents immediate charging during the trial period
      const subscriptionPayload: any = {
        plan_id: planId,
        customer_id: customerId, // Required: Link subscription to customer
        customer_notify: 1, // Notify customer
        total_count: billingCycle === 'monthly' ? 12 : 1, // Auto-renew
        start_at: trialDays > 0 ? trialEnd : now, // Start after trial ends, or immediately if no trial
        notes: {
          orderId: paymentOrder.orderId,
          userId: paymentOrder.userId.toString(),
          planId: paymentOrder.planId,
          cycle: billingCycle,
          trialDays: trialDays > 0 ? trialDays.toString() : undefined, // Store trial info in notes
        },
      };

      logger.info(`Creating Razorpay subscription with ${trialDays}-day trial for order: ${paymentOrder.orderId}`);

      const response = await this.axiosInstance.post<RazorpaySubscriptionResponse>(
        '/v1/subscriptions',
        subscriptionPayload
      );

      const subscription = response.data;

      return {
        subscriptionId: subscription.id,
        customerToken: customerId,
        checkoutData: {
          subscriptionId: subscription.id,
          keyId: RAZORPAY_CONFIG.keyId, // Frontend needs this for Razorpay Checkout SDK
        },
        providerMetadata: {
          razorpaySubscriptionId: subscription.id,
          razorpayCustomerId: customerId,
          razorpayPlanId: planId,
          status: subscription.status,
          trialEnd: trialDays > 0 ? new Date(trialEnd * 1000).toISOString() : null,
          chargeAt: subscription.charge_at ? new Date(subscription.charge_at * 1000).toISOString() : null,
        },
      };
    } catch (error: any) {
      // Log the full error response from Razorpay for debugging
      const errorResponse = error.response?.data;
      const errorDetails = errorResponse || error.message;
      
      logger.error(
        {
          error: error.message,
          errorResponse,
          errorDetails,
          planId: request.paymentOrder.planId,
          billingCycle: request.billingCycle,
          trialDays: request.trialDays,
        },
        'Error creating Razorpay recurring subscription'
      );
      
      // Extract more detailed error message from Razorpay response
      const razorpayError = errorResponse?.error?.description || 
                           errorResponse?.error?.reason || 
                           errorResponse?.error?.field ||
                           errorResponse?.error?.code ||
                           error.message;
      throw new Error(`Razorpay subscription creation failed: ${razorpayError}`);
    }
  }

  /**
   * Get or create Razorpay customer
   */
  private async getOrCreateCustomer(customerData: {
    email: string;
    name: string;
    contact?: string;
  }): Promise<string> {
    try {
      // Try to find existing customer by email
      const customersResponse = await this.axiosInstance.get('/v1/customers', {
        params: {
          email: customerData.email,
          count: 1,
        },
      });

      if (customersResponse.data.items && customersResponse.data.items.length > 0) {
        return customersResponse.data.items[0].id;
      }

      // Create new customer
      const customerPayload: any = {
        name: customerData.name,
        email: customerData.email,
      };

      if (customerData.contact) {
        customerPayload.contact = customerData.contact;
      }

      const response = await this.axiosInstance.post('/v1/customers', customerPayload);
      return response.data.id;
    } catch (error: any) {
      logger.error(error, 'Error getting or creating Razorpay customer');
      throw new Error(`Failed to get or create customer: ${error.message}`);
    }
  }

  /**
   * Charge recurring subscription
   */
  async chargeRecurring(
    request: ChargeRecurringRequest
  ): Promise<ChargeRecurringResponse> {
    try {
      if (!RAZORPAY_CONFIG.enableRecurring) {
        throw new Error('Recurring payments are not enabled');
      }

      if (!request.subscription.providerSubscriptionId) {
        throw new Error('No Razorpay subscription ID found');
      }

      // Razorpay automatically charges subscriptions based on plan schedule
      // This method is for manual charges if needed
      // For automatic charges, webhooks handle the payment.captured event

      logger.info(`Razorpay subscription charges are handled automatically via webhooks`);

      return {
        success: true,
        transactionId: '',
        providerTransactionId: '',
      };
    } catch (error: any) {
      logger.error(error, 'Error charging Razorpay recurring subscription');
      return {
        success: false,
        transactionId: '',
        error: error.message || 'Recurring charge failed',
      };
    }
  }

  /**
   * Cancel recurring subscription in Razorpay
   */
  async cancelRecurringSubscription(subscription: ISubscription): Promise<boolean> {
    try {
      if (!subscription.providerSubscriptionId) {
        throw new Error('No Razorpay subscription ID found');
      }

      logger.info(`Canceling Razorpay subscription: ${subscription.providerSubscriptionId}`);

      const response = await this.axiosInstance.post(
        `/v1/subscriptions/${subscription.providerSubscriptionId}/cancel`,
        {}
      );

      return response.data.status === 'cancelled';
    } catch (error: any) {
      logger.error(error, 'Error canceling Razorpay subscription');
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!RAZORPAY_CONFIG.webhookSecret) {
        logger.warn('Razorpay webhook secret not configured');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_CONFIG.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error(error, 'Error verifying webhook signature');
      return false;
    }
  }

  /**
   * Parse webhook payload from Razorpay
   */
  parseWebhookPayload(rawPayload: Record<string, any>): WebhookPayload | null {
    try {
      const payload = rawPayload as RazorpayWebhookPayload;
      const { event, payload: eventPayload } = payload;

      let webhookEvent: WebhookEventType;

      // Map Razorpay events to our webhook event types
      switch (event) {
        case 'payment.captured':
          webhookEvent = 'payment.success';
          break;
        case 'payment.failed':
          webhookEvent = 'payment.failed';
          break;
        case 'payment.authorized':
          webhookEvent = 'payment.pending';
          break;
        case 'subscription.activated':
        case 'subscription.charged':
          webhookEvent = 'subscription.charge.success';
          break;
        case 'subscription.cancelled':
          webhookEvent = 'subscription.canceled';
          break;
        case 'subscription.completed':
          webhookEvent = 'subscription.renewed';
          break;
        default:
          logger.warn(`Unknown Razorpay webhook event: ${event}`);
          return null;
      }

      return {
        event: webhookEvent,
        data: eventPayload,
        provider: 'razorpay',
        timestamp: new Date(payload.created_at * 1000),
        signature: rawPayload.signature || '',
      };
    } catch (error: any) {
      logger.error(error, 'Error parsing Razorpay webhook payload');
      return null;
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  private verifySignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    try {
      const text = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_CONFIG.keySecret)
        .update(text)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error(error, 'Error verifying Razorpay signature');
      return false;
    }
  }

  /**
   * Convert amount to smallest currency unit
   * INR: paise (multiply by 100)
   * USD/EUR/GBP: cents (multiply by 100)
   */
  private convertToSmallestUnit(amount: number, currency: string): number {
    return Math.round(amount * 100);
  }

  /**
   * Generate checkout URL for Razorpay
   * Frontend will use Razorpay Checkout SDK, but we provide a fallback URL
   */
  private generateCheckoutUrl(
    orderId: string,
    options: {
      amount: number;
      currency: string;
      name: string;
      description: string;
      prefill: {
        name: string;
        email: string;
        contact: string;
      };
      notes: Record<string, any>;
    }
  ): string {
    // For React Native, frontend will use Razorpay Checkout SDK
    // This URL is a fallback for web-based checkout
    const params = new URLSearchParams({
      order_id: orderId,
      key: RAZORPAY_CONFIG.keyId,
      amount: options.amount.toString(),
      currency: options.currency,
      name: options.name,
      description: options.description,
      prefill_name: options.prefill.name,
      prefill_email: options.prefill.email,
      prefill_contact: options.prefill.contact,
    });

    return `https://checkout.razorpay.com/v1/checkout.js?${params.toString()}`;
  }

  /**
   * Get or create Razorpay plan for subscription
   */
  private async getOrCreatePlan(
    paymentOrder: IPaymentOrder,
    billingCycle: 'monthly' | 'yearly'
  ): Promise<string> {
    try {
      // Check if plan exists
      const planName = `plan_${paymentOrder.planId}_${billingCycle}`;
      const amountInSmallestUnit = this.convertToSmallestUnit(
        paymentOrder.totalAmount,
        paymentOrder.currency
      );

      // Try to fetch existing plan
      try {
        const plansResponse = await this.axiosInstance.get('/v1/plans', {
          params: {
            count: 100,
          },
        });

        // Search for existing plan by item name, amount, and currency
        const existingPlan = plansResponse.data.items.find(
          (plan: any) => {
            const item = plan.item || plan;
            return (
              item.name === planName ||
              (item.amount === amountInSmallestUnit &&
               item.currency === paymentOrder.currency &&
               plan.period === (billingCycle === 'monthly' ? 'monthly' : 'yearly'))
            );
          }
        );

        if (existingPlan) {
          logger.info(`Found existing Razorpay plan: ${existingPlan.id} for ${planName}`);
          return existingPlan.id;
        }
      } catch (error: any) {
        // If fetching plans fails, log but continue to try creating
        logger.warn(`Could not fetch existing plans: ${error.message}`);
      }

      // Create new plan
      const planPayload = {
        period: billingCycle === 'monthly' ? 'monthly' : 'yearly',
        interval: 1,
        item: {
          name: planName,
          description: `${paymentOrder.planId} - ${billingCycle}`,
          amount: amountInSmallestUnit,
          currency: paymentOrder.currency,
        },
        notes: {
          planId: paymentOrder.planId,
          billingPeriod: billingCycle,
        },
      };

      logger.info(`Creating Razorpay plan: ${planName} with amount ${amountInSmallestUnit} ${paymentOrder.currency}`);
      const response = await this.axiosInstance.post('/v1/plans', planPayload);
      logger.info(`Successfully created Razorpay plan: ${response.data.id}`);
      return response.data.id;
    } catch (error: any) {
      // Log the full error response from Razorpay for debugging
      const errorResponse = error.response?.data;
      const errorDetails = errorResponse || error.message;
      
      logger.error(
        {
          error: error.message,
          errorResponse,
          errorDetails,
          planId: paymentOrder.planId,
          billingCycle,
          planName: `plan_${paymentOrder.planId}_${billingCycle}`,
        },
        'Error getting or creating Razorpay plan'
      );
      
      // Extract more detailed error message from Razorpay response
      const razorpayError = errorResponse?.error?.description || 
                           errorResponse?.error?.reason || 
                           errorResponse?.error?.field ||
                           errorResponse?.error?.code ||
                           error.message;
      
      // If Plans API is not available, provide helpful error message
      if (errorResponse?.error?.description?.includes('not found') || 
          errorResponse?.error?.code === 'BAD_REQUEST_ERROR') {
        throw new Error(
          `Razorpay Plans API is not available. Please ensure:\n` +
          `1. Your Razorpay account has Subscriptions/Plans API enabled\n` +
          `2. You're using the correct API keys (test keys for sandbox, live keys for production)\n` +
          `3. The Plans API feature is activated in your Razorpay dashboard\n` +
          `Original error: ${razorpayError}`
        );
      }
      
      throw new Error(`Failed to create Razorpay plan: ${razorpayError}`);
    }
  }
}

// Export singleton instance
export const razorpayProvider = new RazorpayProvider();

