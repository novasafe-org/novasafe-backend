import dotenv from 'dotenv';
import {
  getTrialDurationLabel,
  getTrialDays,
  getTrialDurationMs,
  getTrialDurationSeconds,
  getTrialEndDate,
  TRIAL_CONFIG,
} from './trial.config';

dotenv.config();

export const DBCONFIG = {
  vault: {
    type: 'mongodb',
    databaseName: process.env.VAULT_DB_NAME || 'vault',
    host: process.env.VAULT_DB_HOST,
    port: process.env.VAULT_DB_PORT || 27017,
    uri: `mongodb+srv://${process.env.VAULT_DB_USERNAME}:${process.env.VAULT_DB_PASSWORD}@${process.env.VAULT_DB_HOST}/${process.env.VAULT_DB_NAME}?retryWrites=true&w=majority`,
    collections: {
      users: 'users',
      vaultItems: 'vaultItems',
      vaultUsers: 'vaultUsers',
      folders: 'folders',
      sessions: 'sessions',
      auditLogs: 'audit_logs',
      securityEvents: 'security_events',
      passwordBreaches: 'password_breaches',
      shares: 'shares',
      userKeys: 'userKeys',
      subscriptions: 'subscriptions',
      paymentOrders: 'payment_orders',
      invoices: 'invoices',
      coupons: 'coupons',
      otps: 'otps',
      invitations: 'invitations',
      accessRequests: 'accessRequests',
      activityLogs: 'activityLogs',
      organizationMembers: 'organizationMembers',
      workspaces: 'workspaces',
      secrets: 'secrets',
      secretVersions: 'secretVersions',
      secretAccessLogs: 'secretAccessLogs',
      personalAccessTokens: 'personalAccessTokens',
      serviceAccounts: 'serviceAccounts',
    },
  },
};

export const PAYU_CONFIG = {
  merchantId: process.env.PAYU_MERCHANT_ID || '',
  merchantKey: process.env.PAYU_MERCHANT_KEY || '',
  merchantSalt: process.env.PAYU_MERCHANT_SALT || '',
  environment: (process.env.PAYU_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  get baseUrl() {
    if (this.environment === 'sandbox') {
      return process.env.PAYU_TEST_URL || process.env.PAYU_BASE_URL || 'https://test.payu.in';
    }
    return process.env.PAYU_BASE_URL || 'https://secure.payu.in';
  },
  get apiUrl() {
    if (this.environment === 'sandbox') {
      return process.env.PAYU_TEST_API_URL || process.env.PAYU_API_URL || 'https://test.payu.in';
    }
    return process.env.PAYU_API_URL || 'https://secure.payu.in';
  },
  paymentTimeout: parseInt(process.env.PAYU_PAYMENT_TIMEOUT || '1800', 10),
  orderExpiryMinutes: parseInt(process.env.PAYU_ORDER_EXPIRY_MINUTES || '30', 10),
  successUrl: process.env.PAYU_SUCCESS_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/success`,
  failureUrl: process.env.PAYU_FAILURE_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/failure`,
  webhookUrl: process.env.PAYU_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/webhook`,
  enableRecurring: process.env.PAYU_ENABLE_RECURRING === 'true',
  isValid() {
    return !!(this.merchantId && this.merchantKey && this.merchantSalt && this.baseUrl && this.apiUrl);
  },
};

export const RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  environment: (process.env.RAZORPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  get baseUrl() {
    return 'https://api.razorpay.com';
  },
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  successUrl: process.env.RAZORPAY_SUCCESS_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/success`,
  failureUrl: process.env.RAZORPAY_FAILURE_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/failure`,
  webhookUrl: process.env.RAZORPAY_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/webhook/razorpay`,
  enableRecurring: process.env.RAZORPAY_ENABLE_RECURRING !== 'false',
  isValid() {
    return !!(this.keyId && this.keySecret && this.baseUrl);
  },
};

export {
  getTrialDurationMs,
  getTrialDurationSeconds,
  getTrialEndDate,
  getTrialDays,
  getTrialDurationLabel,
  TRIAL_CONFIG,
};
