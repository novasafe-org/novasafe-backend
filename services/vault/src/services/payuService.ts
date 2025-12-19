/**
 * PayU Payment Service
 * 
 * Handles integration with PayU payment gateway.
 * Supports both one-time and recurring payments.
 * Follows SOLID principles with single responsibility.
 */

import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { PAYU_CONFIG } from '../../config/config';
import logger from '../logger';
import type { IPaymentOrder } from '../models/PaymentOrder';
import type { ISubscription } from '../models/Subscription';

/**
 * PayU API Response Types
 */
interface PayUCreateOrderResponse {
  status: number;
  msg: string;
  paymentDetails?: {
    paymentId: string;
    redirectUrl: string;
  };
}

interface PayUVerifyPaymentResponse {
  status: number;
  msg: string;
  transaction_details?: Record<string, any>;
}

interface PayUCreateSubscriptionResponse {
  status: number;
  msg: string;
  subscriptionId?: string;
  customerToken?: string;
}

/**
 * PayU Service Class
 * Handles all PayU API interactions
 */
class PayUService {
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
   * Generate PayU hash for request verification
   * PayU uses SHA512 hash of key-value pairs
   */
  private generateHash(params: Record<string, string>): string {
    const hashString = Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('|');

    const hash = crypto
      .createHash('sha512')
      .update(`${hashString}|${PAYU_CONFIG.merchantSalt}`)
      .digest('hex');

    return hash.toLowerCase();
  }

  /**
   * Create payment order in PayU
   * Returns redirect URL for web checkout
   */
  async createPaymentOrder(
    paymentOrder: IPaymentOrder,
    userEmail: string,
    userFirstName: string,
    userPhone?: string
  ): Promise<{ paymentId: string; redirectUrl: string; requestHash: string }> {
    try {
      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

      const txnId = paymentOrder.orderId;
      const amount = paymentOrder.totalAmount.toFixed(2);
      const productInfo = `${paymentOrder.planId} - ${paymentOrder.billingPeriod}`;
      const firstName = userFirstName.split(' ')[0] || userFirstName;
      const email = userEmail;

      // Build hash parameters
      const hashParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        txnid: txnId,
        amount: amount,
        productinfo: productInfo,
        firstname: firstName,
        email: email,
        surl: PAYU_CONFIG.successUrl,
        furl: PAYU_CONFIG.failureUrl,
      };

      if (userPhone) {
        hashParams.phone = userPhone;
      }

      // Generate hash
      const hash = this.generateHash(hashParams);

      // Prepare request payload
      const payload = {
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

      // Note: pg and bankcode are only needed for specific payment gateways
      // For regular credit card payments, PayU handles this automatically
      // Only add if explicitly required for recurring setup

      logger.info(`Creating PayU payment order: ${txnId}`);
      logger.info(`PayU Base URL: ${PAYU_CONFIG.baseUrl}`);
      logger.info(`PayU Environment: ${PAYU_CONFIG.environment}`);
      logger.debug(`PayU Request Payload: ${JSON.stringify(payload, null, 2)}`);

      // PayU India uses direct URL construction with all parameters
      // Payment page URL format: https://test.payu.in/_payment
      const paymentUrl = `${PAYU_CONFIG.baseUrl}/_payment`;
      
      // Construct payment URL with all parameters as query string
      const paymentParams = new URLSearchParams();
      Object.keys(payload).forEach(key => {
        if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
          paymentParams.append(key, String(payload[key]));
        }
      });
      
      const redirectUrl = `${paymentUrl}?${paymentParams.toString()}`;

      logger.info(`PayU Payment Redirect URL generated`);
      logger.debug(`Redirect URL: ${redirectUrl.substring(0, 200)}...`);

      // Generate a payment ID for tracking (PayU will generate its own during payment)
      const paymentId = `PAYU_${txnId}`;

      return {
        paymentId: paymentId,
        redirectUrl: redirectUrl,
        requestHash: hash,
      };
    } catch (error: any) {
      logger.error(error, 'Error creating PayU payment order');
      
      // Enhanced error logging for PayU API errors
      if (error.response) {
        logger.error(`PayU API Error Response: ${JSON.stringify(error.response.data, null, 2)}`);
        logger.error(`PayU API Status: ${error.response.status}`);
        logger.error(`PayU API Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
        
        // Provide more helpful error messages
        if (error.response.status === 403) {
          throw new Error(
            'PayU authentication failed. Please check:\n' +
            '1. Merchant Key and Salt are correct\n' +
            '2. Using correct environment (sandbox vs production)\n' +
            '3. Merchant account is activated\n' +
            `4. Current environment: ${PAYU_CONFIG.environment}\n` +
            `5. API URL: ${PAYU_CONFIG.apiUrl}`
          );
        }
      }
      
      throw new Error(`PayU payment order creation failed: ${error.message}`);
    }
  }

  /**
   * Verify payment status with PayU
   * Used to verify payment after callback
   */
  async verifyPayment(
    paymentOrder: IPaymentOrder,
    payuResponse: Record<string, string>
  ): Promise<{ verified: boolean; status: string; transactionDetails: Record<string, any> }> {
    try {
      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

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
      } = payuResponse;

      // Verify hash
      const hashParams: Record<string, string> = {
        key: PAYU_CONFIG.merchantKey,
        salt: PAYU_CONFIG.merchantSalt,
        command: 'verify_payment',
        var1: txnid || '',
      };

      const expectedHash = this.generateHash(hashParams);

      // Verify payment with PayU API
      const verifyPayload = {
        key: PAYU_CONFIG.merchantKey,
        command: 'verify_payment',
        var1: txnid || paymentOrder.orderId,
        hash: expectedHash,
      };

      const response = await this.axiosInstance.post<PayUVerifyPaymentResponse>(
        '/payment/verify',
        verifyPayload
      );

      const verified = response.data.status === 1 && status === 'success';

      return {
        verified,
        status: status || 'failed',
        transactionDetails: {
          ...payuResponse,
          payuVerificationResponse: response.data,
        },
      };
    } catch (error: any) {
      logger.error(error, 'Error verifying PayU payment');
      return {
        verified: false,
        status: 'failed',
        transactionDetails: {},
      };
    }
  }

  /**
   * Create recurring subscription in PayU
   * Sets up automatic recurring billing
   */
  async createRecurringSubscription(
    paymentOrder: IPaymentOrder,
    userEmail: string,
    userFirstName: string,
    userPhone?: string
  ): Promise<{ subscriptionId: string; customerToken: string }> {
    try {
      if (!PAYU_CONFIG.enableRecurring) {
        throw new Error('Recurring payments are not enabled');
      }

      if (!PAYU_CONFIG.isValid()) {
        throw new Error('PayU configuration is incomplete');
      }

      // First, create initial payment order
      const initialPayment = await this.createPaymentOrder(
        paymentOrder,
        userEmail,
        userFirstName,
        userPhone
      );

      // Then create subscription for recurring billing
      const subscriptionPayload = {
        key: PAYU_CONFIG.merchantKey,
        email: userEmail,
        phone: userPhone || '',
        firstname: userFirstName.split(' ')[0] || userFirstName,
        amount: paymentOrder.totalAmount.toFixed(2),
        billingCycle: paymentOrder.billingPeriod === 'monthly' ? 'MONTHLY' : 'YEARLY',
        billingAmount: paymentOrder.totalAmount.toFixed(2),
        paymentId: initialPayment.paymentId,
      };

      const hash = this.generateHash(subscriptionPayload);
      subscriptionPayload['hash'] = hash;

      logger.info(`Creating PayU recurring subscription for order: ${paymentOrder.orderId}`);

      const response = await this.axiosInstance.post<PayUCreateSubscriptionResponse>(
        '/recurring/subscription',
        subscriptionPayload
      );

      if (response.data.status !== 1 || !response.data.subscriptionId) {
        throw new Error(response.data.msg || 'Failed to create recurring subscription');
      }

      return {
        subscriptionId: response.data.subscriptionId,
        customerToken: response.data.customerToken || '',
      };
    } catch (error: any) {
      logger.error(error, 'Error creating PayU recurring subscription');
      throw new Error(`PayU subscription creation failed: ${error.message}`);
    }
  }

  /**
   * Cancel recurring subscription in PayU
   */
  async cancelRecurringSubscription(subscription: ISubscription): Promise<boolean> {
    try {
      if (!subscription.payuSubscriptionId) {
        throw new Error('No PayU subscription ID found');
      }

      const cancelPayload = {
        key: PAYU_CONFIG.merchantKey,
        subscriptionId: subscription.payuSubscriptionId,
      };

      const hash = this.generateHash(cancelPayload);
      cancelPayload['hash'] = hash;

      logger.info(`Canceling PayU subscription: ${subscription.payuSubscriptionId}`);

      const response = await this.axiosInstance.post(
        '/recurring/cancel',
        cancelPayload
      );

      return response.data.status === 1;
    } catch (error: any) {
      logger.error(error, 'Error canceling PayU subscription');
      return false;
    }
  }
}

// Export singleton instance
export const payuService = new PayUService();

