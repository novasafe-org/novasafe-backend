// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_LOG_ACCESSIBLE_ROLES = exports.ACTIVITY_LOG_SUPPORTED_PLANS = exports.ACTION_SEVERITY_MAP = exports.ACTIVITY_LOG_ACTIONS = exports.ACTIVITY_LOG_DEFAULTS = void 0;
exports.ACTIVITY_LOG_DEFAULTS = {
    PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 500,
    RETENTION_DAYS: 90,
};
exports.ACTIVITY_LOG_ACTIONS = {
    AUTHENTICATION: [
        'USER_LOGIN_SUCCESS',
        'USER_LOGIN_FAILED',
        'USER_LOGOUT',
        'MFA_ENABLED',
        'MFA_DISABLED',
        'SESSION_REVOKED',
        'VAULT_UNLOCKED',
        'PASSWORD_RESET',
        'ACCOUNT_RECOVERED',
    ],
    VAULT_ITEM: [
        'VAULT_CREATED',
        'VAULT_RENAMED',
        'VAULT_DELETED',
        'ITEM_CREATED',
        'ITEM_UPDATED',
        'ITEM_DELETED',
        'ITEM_VIEWED',
    ],
    SHARING_ACCESS: [
        'ITEM_SHARED',
        'SAFE_SHARED',
        'ACCESS_GRANTED',
        'ACCESS_REVOKED',
        'PERMISSION_CHANGED',
        'INVITATION_SENT',
        'INVITATION_ACCEPTED',
    ],
    ADMIN_ORG: [
        'MEMBER_ADDED',
        'MEMBER_REMOVED',
        'ROLE_CHANGED',
        'ORGANIZATION_SETTINGS_UPDATED',
    ],
    BILLING: [
        'TRIAL_STARTED',
        'SUBSCRIPTION_ACTIVATED',
        'PAYMENT_METHOD_ADDED',
        'PAYMENT_FAILED',
        'SUBSCRIPTION_CANCELLED',
    ],
    SECURITY: [
        'SUSPICIOUS_LOGIN',
        'MULTIPLE_FAILED_LOGINS',
        'PASSWORD_EXPORT_ATTEMPT',
        'DATA_EXPORT',
    ],
};
exports.ACTION_SEVERITY_MAP = {
    USER_LOGIN_SUCCESS: 'info',
    USER_LOGIN_FAILED: 'warning',
    USER_LOGOUT: 'info',
    MFA_ENABLED: 'info',
    MFA_DISABLED: 'warning',
    SESSION_REVOKED: 'info',
    VAULT_UNLOCKED: 'info',
    PASSWORD_RESET: 'warning',
    ACCOUNT_RECOVERED: 'info',
    VAULT_CREATED: 'info',
    VAULT_RENAMED: 'info',
    VAULT_DELETED: 'warning',
    ITEM_CREATED: 'info',
    ITEM_UPDATED: 'info',
    ITEM_DELETED: 'warning',
    ITEM_VIEWED: 'info',
    ITEM_SHARED: 'info',
    SAFE_SHARED: 'info',
    ACCESS_GRANTED: 'info',
    ACCESS_REVOKED: 'warning',
    PERMISSION_CHANGED: 'info',
    INVITATION_SENT: 'info',
    INVITATION_ACCEPTED: 'info',
    MEMBER_ADDED: 'info',
    MEMBER_REMOVED: 'warning',
    ROLE_CHANGED: 'warning',
    ORGANIZATION_SETTINGS_UPDATED: 'info',
    TRIAL_STARTED: 'info',
    SUBSCRIPTION_ACTIVATED: 'info',
    PAYMENT_METHOD_ADDED: 'info',
    PAYMENT_FAILED: 'warning',
    SUBSCRIPTION_CANCELLED: 'warning',
    SUSPICIOUS_LOGIN: 'critical',
    MULTIPLE_FAILED_LOGINS: 'critical',
    PASSWORD_EXPORT_ATTEMPT: 'warning',
    DATA_EXPORT: 'info',
};
exports.ACTIVITY_LOG_SUPPORTED_PLANS = ['team', 'business'];
exports.ACTIVITY_LOG_ACCESSIBLE_ROLES = ['admin', 'super-admin'];


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const ACTIVITY_LOG_ACCESSIBLE_ROLES = __cjs_exports.ACTIVITY_LOG_ACCESSIBLE_ROLES;
export const ACTIVITY_LOG_SUPPORTED_PLANS = __cjs_exports.ACTIVITY_LOG_SUPPORTED_PLANS;
export const ACTION_SEVERITY_MAP = __cjs_exports.ACTION_SEVERITY_MAP;
export const ACTIVITY_LOG_ACTIONS = __cjs_exports.ACTIVITY_LOG_ACTIONS;
export const ACTIVITY_LOG_DEFAULTS = __cjs_exports.ACTIVITY_LOG_DEFAULTS;
