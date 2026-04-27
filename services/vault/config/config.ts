// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIAL_CONFIG = exports.getTrialDurationLabel = exports.getTrialDays = exports.getTrialEndDate = exports.getTrialDurationSeconds = exports.getTrialDurationMs = exports.RAZORPAY_CONFIG = exports.PAYU_CONFIG = exports.DBCONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.DBCONFIG = {
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
        }
    }
};
exports.PAYU_CONFIG = {
    merchantId: process.env.PAYU_MERCHANT_ID || '',
    merchantKey: process.env.PAYU_MERCHANT_KEY || '',
    merchantSalt: process.env.PAYU_MERCHANT_SALT || '',
    environment: (process.env.PAYU_ENVIRONMENT || 'sandbox'),
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
        return !!(this.merchantId &&
            this.merchantKey &&
            this.merchantSalt &&
            this.baseUrl &&
            this.apiUrl);
    }
};
exports.RAZORPAY_CONFIG = {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    environment: (process.env.RAZORPAY_ENVIRONMENT || 'sandbox'),
    get baseUrl() {
        if (this.environment === 'sandbox') {
            return 'https://api.razorpay.com';
        }
        return 'https://api.razorpay.com';
    },
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    successUrl: process.env.RAZORPAY_SUCCESS_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/success`,
    failureUrl: process.env.RAZORPAY_FAILURE_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/failure`,
    webhookUrl: process.env.RAZORPAY_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3000'}/v/payments/webhook/razorpay`,
    enableRecurring: process.env.RAZORPAY_ENABLE_RECURRING !== 'false',
    isValid() {
        return !!(this.keyId &&
            this.keySecret &&
            this.baseUrl);
    }
};
var trial_config_1 = require("./trial.config");
Object.defineProperty(exports, "getTrialDurationMs", { enumerable: true, get: function () { return trial_config_1.getTrialDurationMs; } });
Object.defineProperty(exports, "getTrialDurationSeconds", { enumerable: true, get: function () { return trial_config_1.getTrialDurationSeconds; } });
Object.defineProperty(exports, "getTrialEndDate", { enumerable: true, get: function () { return trial_config_1.getTrialEndDate; } });
Object.defineProperty(exports, "getTrialDays", { enumerable: true, get: function () { return trial_config_1.getTrialDays; } });
Object.defineProperty(exports, "getTrialDurationLabel", { enumerable: true, get: function () { return trial_config_1.getTrialDurationLabel; } });
Object.defineProperty(exports, "TRIAL_CONFIG", { enumerable: true, get: function () { return trial_config_1.TRIAL_CONFIG; } });


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const TRIAL_CONFIG = __cjs_exports.TRIAL_CONFIG;
export const getTrialDurationLabel = __cjs_exports.getTrialDurationLabel;
export const getTrialDays = __cjs_exports.getTrialDays;
export const getTrialEndDate = __cjs_exports.getTrialEndDate;
export const getTrialDurationSeconds = __cjs_exports.getTrialDurationSeconds;
export const getTrialDurationMs = __cjs_exports.getTrialDurationMs;
export const RAZORPAY_CONFIG = __cjs_exports.RAZORPAY_CONFIG;
export const PAYU_CONFIG = __cjs_exports.PAYU_CONFIG;
export const DBCONFIG = __cjs_exports.DBCONFIG;
