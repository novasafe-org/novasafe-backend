import dotenv from 'dotenv';
import { DBConfigGeneric } from './types';

dotenv.config();

export const DBCONFIG: Record<string, DBConfigGeneric<Record<string, string>>> = {
  vault: {
    type: 'mongodb',
    databaseName: process.env.VAULT_DB_NAME || 'vault',
    host: process.env.VAULT_DB_HOST,
    port: process.env.VAULT_DB_PORT || 27017,
    uri: `mongodb+srv://${process.env.VAULT_DB_USERNAME}:${process.env.VAULT_DB_PASSWORD}@${process.env.VAULT_DB_HOST}/${process.env.VAULT_DB_NAME}?retryWrites=true&w=majority`,
    collections: {
      // Existing collections
      users: 'users',
      vaultItems: 'vaultItems',
      vaultUsers: 'vaultUsers',
      folders: 'folders',
      // New collections (Level 3, 4, 5)
      sessions: 'sessions',
      auditLogs: 'audit_logs',
      securityEvents: 'security_events',
      passwordBreaches: 'password_breaches',
      // Sharing collections
      shares: 'shares',
      userKeys: 'userKeys',
      // Payment collections
      subscriptions: 'subscriptions',
      paymentOrders: 'payment_orders',
      coupons: 'coupons',
      // Onboarding collections
      otps: 'otps',
      // Access Management collections
      invitations: 'invitations',
      accessRequests: 'accessRequests',
      activityLogs: 'activityLogs',
      organizationMembers: 'organizationMembers',
      // Secrets Manager collections
      secrets: 'secrets',
      secretVersions: 'secretVersions',
      secretAccessLogs: 'secretAccessLogs',
      // Machine Auth collections
      personalAccessTokens: 'personalAccessTokens',
      serviceAccounts: 'serviceAccounts',
    }
  }
};

/**
 * PayU Configuration
 * Loads PayU credentials from environment variables
 */
export const PAYU_CONFIG = {
  // API Credentials
  merchantId: process.env.PAYU_MERCHANT_ID || '',
  merchantKey: process.env.PAYU_MERCHANT_KEY || '',
  merchantSalt: process.env.PAYU_MERCHANT_SALT || '',
  
  // Environment (must be defined before getters)
  environment: (process.env.PAYU_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  
  // API URLs - Switch based on environment
  get baseUrl(): string {
    if (this.environment === 'sandbox') {
      return process.env.PAYU_TEST_URL || process.env.PAYU_BASE_URL || 'https://test.payu.in';
    }
    return process.env.PAYU_BASE_URL || 'https://secure.payu.in';
  },
  
  get apiUrl(): string {
    if (this.environment === 'sandbox') {
      // PayU India sandbox uses form-based submission, not REST API
      return process.env.PAYU_TEST_API_URL || process.env.PAYU_API_URL || 'https://test.payu.in';
    }
    // PayU India production
    return process.env.PAYU_API_URL || 'https://secure.payu.in';
  },
  
  // Payment Settings
  paymentTimeout: parseInt(process.env.PAYU_PAYMENT_TIMEOUT || '1800', 10), // 30 minutes in seconds
  orderExpiryMinutes: parseInt(process.env.PAYU_ORDER_EXPIRY_MINUTES || '30', 10),
  
  // Callback URLs (backend endpoints that PayU will redirect to)
  successUrl: process.env.PAYU_SUCCESS_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/success`,
  failureUrl: process.env.PAYU_FAILURE_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/failure`,
  
  // Webhook URL (server-to-server notifications)
  webhookUrl: process.env.PAYU_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/webhook`,
  
  // Recurring Payments
  enableRecurring: process.env.PAYU_ENABLE_RECURRING === 'true',
  
  // Verify configuration
  isValid(): boolean {
    return !!(
      this.merchantId &&
      this.merchantKey &&
      this.merchantSalt &&
      this.baseUrl &&
      this.apiUrl
    );
  }
};

/**
 * Razorpay Configuration
 * Loads Razorpay credentials from environment variables
 */
export const RAZORPAY_CONFIG = {
  // API Credentials
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  
  // Environment (must be defined before getters)
  environment: (process.env.RAZORPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  
  // API URLs - Switch based on environment
  get baseUrl(): string {
    if (this.environment === 'sandbox') {
      return 'https://api.razorpay.com';
    }
    return 'https://api.razorpay.com';
  },
  
  // Webhook Secret (for webhook signature verification)
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  
  // Callback URLs (backend endpoints that Razorpay will redirect to)
  successUrl: process.env.RAZORPAY_SUCCESS_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/success`,
  failureUrl: process.env.RAZORPAY_FAILURE_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/failure`,
  
  // Webhook URL (server-to-server notifications)
  webhookUrl: process.env.RAZORPAY_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/webhook/razorpay`,
  
  // Recurring Payments
  enableRecurring: process.env.RAZORPAY_ENABLE_RECURRING !== 'false', // Default: true
  
  // Verify configuration
  isValid(): boolean {
    return !!(
      this.keyId &&
      this.keySecret &&
      this.baseUrl
    );
  }
};