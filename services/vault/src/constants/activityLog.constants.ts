/**
 * Activity Log Constants
 * 
 * Centralized constants for activity logging system.
 * Used to ensure consistency across the codebase.
 */

import type {
  ActivityLogAction,
  ActivityLogSeverity,
  ActivityLogTargetType,
  ActivityLogActorRole,
} from '../models/ActivityLog';

/**
 * Default pagination limits
 */
export const ACTIVITY_LOG_DEFAULTS = {
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 500,
  RETENTION_DAYS: 90, // Default retention period (can be extended)
} as const;

/**
 * Action categories for better organization
 */
export const ACTIVITY_LOG_ACTIONS = {
  AUTHENTICATION: [
    'USER_LOGIN_SUCCESS',
    'USER_LOGIN_FAILED',
    'USER_LOGOUT',
    'MFA_ENABLED',
    'MFA_DISABLED',
    'SESSION_REVOKED',
  ] as const,
  VAULT_ITEM: [
    'VAULT_CREATED',
    'VAULT_RENAMED',
    'VAULT_DELETED',
    'ITEM_CREATED',
    'ITEM_UPDATED',
    'ITEM_DELETED',
    'ITEM_VIEWED',
  ] as const,
  SHARING_ACCESS: [
    'ITEM_SHARED',
    'SAFE_SHARED',
    'ACCESS_GRANTED',
    'ACCESS_REVOKED',
    'PERMISSION_CHANGED',
    'INVITATION_SENT',
    'INVITATION_ACCEPTED',
  ] as const,
  ADMIN_ORG: [
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'ROLE_CHANGED',
    'ORGANIZATION_SETTINGS_UPDATED',
  ] as const,
  BILLING: [
    'TRIAL_STARTED',
    'SUBSCRIPTION_ACTIVATED',
    'PAYMENT_METHOD_ADDED',
    'PAYMENT_FAILED',
    'SUBSCRIPTION_CANCELLED',
  ] as const,
  SECURITY: [
    'SUSPICIOUS_LOGIN',
    'MULTIPLE_FAILED_LOGINS',
    'PASSWORD_EXPORT_ATTEMPT',
    'DATA_EXPORT',
  ] as const,
} as const;

/**
 * Severity mapping for actions
 * Determines default severity based on action type
 */
export const ACTION_SEVERITY_MAP: Record<ActivityLogAction, ActivityLogSeverity> = {
  // Authentication - mostly info, failures are warning
  USER_LOGIN_SUCCESS: 'info',
  USER_LOGIN_FAILED: 'warning',
  USER_LOGOUT: 'info',
  MFA_ENABLED: 'info',
  MFA_DISABLED: 'warning',
  SESSION_REVOKED: 'info',
  // Vault & Item - info for normal operations
  VAULT_CREATED: 'info',
  VAULT_RENAMED: 'info',
  VAULT_DELETED: 'warning',
  ITEM_CREATED: 'info',
  ITEM_UPDATED: 'info',
  ITEM_DELETED: 'warning',
  ITEM_VIEWED: 'info',
  // Sharing & Access - info for normal, warning for revocations
  ITEM_SHARED: 'info',
  SAFE_SHARED: 'info',
  ACCESS_GRANTED: 'info',
  ACCESS_REVOKED: 'warning',
  PERMISSION_CHANGED: 'info',
  INVITATION_SENT: 'info',
  INVITATION_ACCEPTED: 'info',
  // Admin / Organization - info for normal, warning for removals
  MEMBER_ADDED: 'info',
  MEMBER_REMOVED: 'warning',
  ROLE_CHANGED: 'warning',
  ORGANIZATION_SETTINGS_UPDATED: 'info',
  // Billing - info for normal, warning for failures
  TRIAL_STARTED: 'info',
  SUBSCRIPTION_ACTIVATED: 'info',
  PAYMENT_METHOD_ADDED: 'info',
  PAYMENT_FAILED: 'warning',
  SUBSCRIPTION_CANCELLED: 'warning',
  // Security - all critical or warning
  SUSPICIOUS_LOGIN: 'critical',
  MULTIPLE_FAILED_LOGINS: 'critical',
  PASSWORD_EXPORT_ATTEMPT: 'warning',
  DATA_EXPORT: 'info',
} as const;

/**
 * Plans that support Activity Logs
 */
export const ACTIVITY_LOG_SUPPORTED_PLANS: readonly string[] = ['team', 'business'] as const;

/**
 * Roles that can access Activity Logs
 */
export const ACTIVITY_LOG_ACCESSIBLE_ROLES: readonly string[] = ['admin', 'super-admin'] as const;

