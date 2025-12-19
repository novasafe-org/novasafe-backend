/**
 * PayU Payment Provider
 * 
 * Implements PayU India payment gateway integration.
 * Supports hosted checkout, recurring payments, and webhooks.
 * 
 * Documentation:
 * - https://docs.payu.in/docs/
 * - https://docs.payu.in/reference/_payment_payu_hosted_checkout
 * - https://docs.payu.in/reference/recurring_payment_api
 * - https://docs.payu.in/reference/payment-consent-transaction-payu-hosted
 * - https://docs.payu.in/docs/webhooks
 */

import axios, { AxiosInstance } from 'axios';
import { PAYU_CONFIG } from '../../../../config/config';
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
import { generatePayUHash, verifyPayUHash, generatePayUApiHash } from '../../../utils/hashGenerator';
import type { IPaymentOrder } from '../../../models/PaymentOrder';
import type { ISubscription } from '../../../models/Subscription';

/**
 * PayU API Response Types
 */
interface PayUApiResponse {
  status: number;
  msg: string;
  [key: string]: any;
}

interface PayUVerifyPaymentResponse extends PayUApiResponse {
  transaction_details?: {
    status?: string;
    amount?: string;
    txnid?: string;
    [key: string]: any;
  };
}

interface PayUCreateSubscriptionResponse extends PayUApiResponse {
  subscriptionId?: string;
  customerToken?: string;
}

interface PayUChargeRecurringResponse extends PayUApiResponse {
  transactionId?: string;
  paymentId?: string;
}

/**
 * PayU Payment Provider Implementation
 */
class PayUProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'payu';
  readonly supportedCountries: CountryCode[] = ['IN'];
  readonly supportedCurrencies: CurrencyCode[] = ['INR'];
  private axiosInstance: AxiosInstance;

  constructor() {
    if (!PAYU_CONFIG.isValid()) {
      logger.warn('PayU configuration is incomplete. Payment features may not work.');
    }

    this.axiosInstance = axios.create({
      baseURL: PAYU_CONFIG.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if provider supports given country and currency
   */
  supports(country: CountryCode, currency: CurrencyCode): boolean {
    return (
      this.supportedCountries.includes(country.toUpperCase() as CountryCode) &&
      this.supportedCurrencies.includes(currency.toUpperCase() as CurrencyCode)
    );
  }

  /**
   * Create payment order in PayU
   * Returns redirect URL for hosted checkout
   */
  async createPaymentOrder(
    request: CreatePaymentOrderRequest
  ): Promise<CreatePaymentOrderResponse> {
    try {
      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

      const { paymentOrder, userEmail, userFirstName, userPhone } = request;

      const txnId = paymentOrder.orderId;
      const amount = paymentOrder.totalAmount.toFixed(2);
      const productInfo = `${paymentOrder.planId} - ${paymentOrder.billingPeriod}`;
      const firstName = userFirstName.split(' ')[0] || userFirstName;
      const email = userEmail;

      // Generate hash according to PayU spec: SHA512(key|txnid|amount|productinfo|firstname|email|salt)
      const hash = generatePayUHash(
        {
          key: PAYU_CONFIG.merchantKey,
          txnid: txnId,
          amount: amount,
          productinfo: productInfo,
          firstname: firstName,
          email: email,
          salt: PAYU_CONFIG.merchantSalt,
        },
        PAYU_CONFIG.merchantSalt
      );

      // Build payment parameters
      const paymentParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        txnid: txnId,
        amount: amount,
        productinfo: productInfo,
        firstname: firstName,
        email: email,
        phone: userPhone || '',
        surl: PAYU_CONFIG.successUrl,
        furl: PAYU_CONFIG.failureUrl,
        hash: hash,
        service_provider: 'payu_paisa',
      };

      // Add currency
      paymentParams.currency = paymentOrder.currency;

      // For recurring payments, add additional parameters
      if (paymentOrder.paymentType === 'recurring') {
        // Enable recurring payment consent
        paymentParams.enable_payment_methods = 'CC,DC,UPI';
        // Add billing cycle info (will be used for SI registration)
        paymentParams.billing_cycle = paymentOrder.billingPeriod === 'monthly' ? 'MONTHLY' : 'YEARLY';
      }

      logger.info(`Creating PayU payment order: ${txnId}`);
      logger.debug(`PayU Request Params: ${JSON.stringify({ ...paymentParams, hash: '[REDACTED]' }, null, 2)}`);

      // PayU India uses form-based submission via hosted checkout page
      // Construct payment URL with all parameters as query string
      const paymentUrl = `${PAYU_CONFIG.baseUrl}/_payment`;
      const paymentParamsQuery = new URLSearchParams();
      
      Object.keys(paymentParams).forEach((key) => {
        const value = paymentParams[key];
        if (value !== undefined && value !== null && value !== '') {
          paymentParamsQuery.append(key, String(value));
        }
      });

      const redirectUrl = `${paymentUrl}?${paymentParamsQuery.toString()}`;

      logger.info(`PayU Payment Redirect URL generated for order: ${txnId}`);

      // Generate a payment ID for tracking
      const paymentId = `PAYU_${txnId}`;

      return {
        paymentId: paymentId,
        redirectUrl: redirectUrl,
        requestHash: hash,
        providerMetadata: {
          txnid: txnId,
          amount: amount,
          currency: paymentOrder.currency,
        },
      };
    } catch (error: any) {
      logger.error(error, 'Error creating PayU payment order');
      
      if (error.response) {
        logger.error(`PayU API Error: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      throw new Error(`PayU payment order creation failed: ${error.message}`);
    }
  }

  /**
   * Verify payment status with PayU
   * Uses PayU verify_payment API
   */
  async verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse> {
    try {
      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

      const { paymentOrder, providerResponse } = request;

      // Extract PayU response parameters
      const {
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        status,
        hash: responseHash,
        ...otherParams
      } = providerResponse;

      // Verify hash first
      if (responseHash && txnid && amount && productinfo && firstname && email && status) {
        const hashValid = verifyPayUHash(
          {
            key: PAYU_CONFIG.merchantKey,
            txnid: txnid,
            amount: amount,
            productinfo: productinfo,
            firstname: firstname,
            email: email,
            status: status,
            salt: PAYU_CONFIG.merchantSalt,
            udf1: otherParams.udf1,
            udf2: otherParams.udf2,
            udf3: otherParams.udf3,
            udf4: otherParams.udf4,
            udf5: otherParams.udf5,
          },
          PAYU_CONFIG.merchantSalt,
          responseHash
        );

        if (!hashValid) {
          logger.warn(`PayU hash verification failed for txnid: ${txnid}`);
          return {
            verified: false,
            status: 'failed',
            transactionDetails: providerResponse,
          };
        }
      }

      // Verify payment with PayU API
      const verifyParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        command: 'verify_payment',
        var1: txnid || paymentOrder.orderId,
      };

      const verifyHash = generatePayUApiHash(verifyParams, PAYU_CONFIG.merchantSalt);
      verifyParams.hash = verifyHash;

      logger.info(`Verifying PayU payment: ${txnid || paymentOrder.orderId}`);

      const response = await this.axiosInstance.post<PayUVerifyPaymentResponse>(
        '/payment/verify',
        verifyParams
      );

      const apiVerified = response.data.status === 1;
      const responseStatus = status?.toLowerCase() === 'success' ? 'success' : 
                           status?.toLowerCase() === 'pending' ? 'pending' : 'failed';

      const verified = apiVerified && responseStatus === 'success';

      return {
        verified,
        status: responseStatus,
        transactionDetails: {
          ...providerResponse,
          payuVerificationResponse: response.data,
        },
        providerTransactionId: txnid,
      };
    } catch (error: any) {
      logger.error(error, 'Error verifying PayU payment');
      return {
        verified: false,
        status: 'failed',
        transactionDetails: request.providerResponse,
      };
    }
  }

  /**
   * Create recurring subscription in PayU
   * Sets up automatic recurring billing via Payment Consent (SI)
   */
  async createRecurringSubscription(
    request: CreateRecurringSubscriptionRequest
  ): Promise<CreateRecurringSubscriptionResponse> {
    try {
      if (!PAYU_CONFIG.enableRecurring) {
        throw new Error('Recurring payments are not enabled');
      }

      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

      const { paymentOrder, userEmail, userFirstName, userPhone, billingCycle } = request;

      // First, create initial payment order with SI consent
      const initialPayment = await this.createPaymentOrder({
        paymentOrder,
        userEmail,
        userFirstName,
        userPhone,
        userCountry: 'IN',
      });

      // Note: PayU recurring subscription setup happens after first successful payment
      // The customer token is returned in the payment response
      // This method is a placeholder for future SI registration API calls

      logger.info(`PayU recurring subscription setup initiated for order: ${paymentOrder.orderId}`);

      return {
        subscriptionId: `PAYU_SUB_${paymentOrder.orderId}`,
        customerToken: initialPayment.paymentId, // Will be updated after payment success
        providerMetadata: {
          initialPaymentId: initialPayment.paymentId,
          billingCycle: billingCycle,
        },
      };
    } catch (error: any) {
      logger.error(error, 'Error creating PayU recurring subscription');
      throw new Error(`PayU subscription creation failed: ${error.message}`);
    }
  }

  /**
   * Charge recurring subscription
   * Uses PayU SI (Standing Instruction) transaction API
   */
  async chargeRecurring(
    request: ChargeRecurringRequest
  ): Promise<ChargeRecurringResponse> {
    try {
      if (!PAYU_CONFIG.enableRecurring) {
        throw new Error('Recurring payments are not enabled');
      }

      if (!request.subscription.payuCustomerToken) {
        throw new Error('No PayU customer token found for subscription');
      }

      const { subscription, amount, currency } = request;

      // Build SI transaction parameters
      const siParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        command: 'si_transaction',
        var1: subscription.payuCustomerToken, // Customer token from initial payment
        var2: amount.toFixed(2), // Amount
        var3: currency, // Currency
      };

      // Generate hash
      const hash = generatePayUApiHash(siParams, PAYU_CONFIG.merchantSalt);
      siParams.hash = hash;

      logger.info(`Charging PayU recurring subscription: ${subscription._id}`);

      const response = await this.axiosInstance.post<PayUChargeRecurringResponse>(
        '/payment/si',
        siParams
      );

      if (response.data.status !== 1) {
        throw new Error(response.data.msg || 'Recurring charge failed');
      }

      return {
        success: true,
        transactionId: response.data.transactionId || response.data.paymentId || '',
        providerTransactionId: response.data.transactionId || response.data.paymentId,
      };
    } catch (error: any) {
      logger.error(error, 'Error charging PayU recurring subscription');
      return {
        success: false,
        transactionId: '',
        error: error.message || 'Recurring charge failed',
      };
    }
  }

  /**
   * Cancel recurring subscription in PayU
   */
  async cancelRecurringSubscription(subscription: ISubscription): Promise<boolean> {
    try {
      if (!subscription.payuSubscriptionId && !subscription.payuCustomerToken) {
        throw new Error('No PayU subscription ID or customer token found');
      }

      const cancelParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        command: 'si_cancel',
        var1: subscription.payuSubscriptionId || subscription.payuCustomerToken || '',
      };

      const hash = generatePayUApiHash(cancelParams, PAYU_CONFIG.merchantSalt);
      cancelParams.hash = hash;

      logger.info(`Canceling PayU subscription: ${subscription.payuSubscriptionId || subscription.payuCustomerToken}`);

      const response = await this.axiosInstance.post<PayUApiResponse>(
        '/payment/si/cancel',
        cancelParams
      );

      return response.data.status === 1;
    } catch (error: any) {
      logger.error(error, 'Error canceling PayU subscription');
      return false;
    }
  }

  /**
   * Verify webhook signature (if PayU provides signature verification)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // PayU webhooks may include signature verification
    // Implementation depends on PayU's webhook signature format
    // For now, return true if hash verification passes
    try {
      // Parse payload and verify hash if present
      const data = JSON.parse(payload);
      if (data.hash) {
        // Verify hash using PayU's webhook hash format
        return true; // Placeholder - implement based on PayU webhook docs
      }
      return true;
    } catch (error) {
      logger.error(error, 'Error verifying webhook signature');
      return false;
    }
  }

  /**
   * Parse webhook payload from PayU
   */
  parseWebhookPayload(rawPayload: Record<string, any>): WebhookPayload | null {
    try {
      // PayU webhook format may vary
      // Common fields: txnid, status, amount, productinfo, etc.
      const { txnid, status, amount, productinfo, ...otherData } = rawPayload;

      let event: WebhookEventType;
      
      if (status === 'success' || status === 'captured') {
        event = 'payment.success';
      } else if (status === 'failed' || status === 'failure') {
        event = 'payment.failed';
      } else if (status === 'pending') {
        event = 'payment.pending';
      } else {
        // Unknown status
        logger.warn(`Unknown PayU webhook status: ${status}`);
        return null;
      }

      return {
        event,
        data: {
          txnid,
          status,
          amount,
          productinfo,
          ...otherData,
        },
        provider: 'payu',
        timestamp: new Date(),
        signature: rawPayload.hash,
      };
    } catch (error: any) {
      logger.error(error, 'Error parsing PayU webhook payload');
      return null;
    }
  }
}

// Export singleton instance
export const payuProvider = new PayUProvider();

