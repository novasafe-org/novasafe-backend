/**
 * Activity Log Model Interface
 * 
 * Represents an immutable audit log entry for security and compliance.
 * These logs are tamper-proof and serve as legal audit records.
 * 
 * Available ONLY for Teams and Business plans.
 * Accessible ONLY to Admin users.
 */

import { ObjectId } from 'mongodb';

/**
 * Action types that can be logged
 * Organized by category for better maintainability
 */
export type ActivityLogAction =
  // Authentication
  | 'USER_LOGIN_SUCCESS'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGOUT'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'SESSION_REVOKED'
  // Vault & Item
  | 'VAULT_CREATED'
  | 'VAULT_RENAMED'
  | 'VAULT_DELETED'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DELETED'
  | 'ITEM_VIEWED'
  // Sharing & Access
  | 'ITEM_SHARED'
  | 'SAFE_SHARED'
  | 'ACCESS_GRANTED'
  | 'ACCESS_REVOKED'
  | 'PERMISSION_CHANGED'
  | 'INVITATION_SENT'
  | 'INVITATION_ACCEPTED'
  // Admin / Organization
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'ORGANIZATION_SETTINGS_UPDATED'
  // Billing
  | 'TRIAL_STARTED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'PAYMENT_METHOD_ADDED'
  | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_CANCELLED'
  // Security
  | 'SUSPICIOUS_LOGIN'
  | 'MULTIPLE_FAILED_LOGINS'
  | 'PASSWORD_EXPORT_ATTEMPT'
  | 'DATA_EXPORT';

/**
 * Target types for activity logs
 */
export type ActivityLogTargetType =
  | 'user'
  | 'vault'
  | 'item'
  | 'safe'
  | 'billing'
  | 'session'
  | 'org'
  | 'subscription'
  | 'payment'
  | 'invitation';

/**
 * Severity levels for activity logs
 */
export type ActivityLogSeverity = 'info' | 'warning' | 'critical';

/**
 * Actor role types
 */
export type ActivityLogActorRole = 'admin' | 'member' | 'system';

/**
 * Activity Log Interface
 * 
 * Immutable audit log entry that records all security-relevant actions.
 * These logs are never edited or deleted - they serve as legal audit records.
 */
export interface IActivityLog {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * Organization/Company identifier
   * For Teams/Business plans, this is the companyName
   * Used to scope logs to organization
   * Required for team/business plans
   */
  organizationId: string;

  /**
   * User ID who performed the action
   * Nullable for system-generated events
   */
  actorUserId: ObjectId | string | null;

  /**
   * Email of the actor (for audit trail)
   * Stored even if user is deleted later
   */
  actorEmail: string | null;

  /**
   * Role of the actor at the time of action
   * 'admin' | 'member' | 'system'
   */
  actorRole: ActivityLogActorRole;

  /**
   * Type of resource that was affected
   * 'user' | 'vault' | 'item' | 'safe' | 'billing' | 'session' | 'org' | 'subscription' | 'payment'
   */
  targetType: ActivityLogTargetType;

  /**
   * ID of the affected resource
   * References the targetType resource
   */
  targetId: string | null;

  /**
   * Action that was performed
   * See ActivityLogAction type for all possible values
   */
  action: ActivityLogAction;

  /**
   * Human-readable description of the action
   * Example: "User logged in successfully"
   */
  description: string;

  /**
   * Additional metadata (JSON object)
   * Contains non-sensitive contextual information
   * Examples: { vaultName: "Personal", itemType: "password" }
   * 
   * ⚠️ NEVER store:
   * - Passwords or secrets
   * - Decrypted data
   * - Sensitive values
   * - Full credit card numbers
   */
  metadata?: Record<string, any> | null;

  /**
   * IP address of the request
   * Captured server-side for security
   */
  ipAddress: string | null;

  /**
   * User agent string
   * Captured server-side for security
   */
  userAgent: string | null;

  /**
   * Geographic location (derived from IP)
   * Format: "Country, City" or "Country"
   * Optional if geolocation unavailable
   */
  location: string | null;

  /**
   * Severity level of the action
   * 'info' | 'warning' | 'critical'
   */
  severity: ActivityLogSeverity;

  /**
   * Timestamp when the action occurred
   * Always stored in UTC
   */
  createdAt: Date;
}

/**
 * Activity Log Query Filters
 * Used for filtering logs in admin API
 */
export interface ActivityLogFilters {
  startDate?: Date;
  endDate?: Date;
  action?: ActivityLogAction | ActivityLogAction[];
  actorUserId?: string;
  actorEmail?: string;
  targetType?: ActivityLogTargetType;
  targetId?: string;
  severity?: ActivityLogSeverity | ActivityLogSeverity[];
  search?: string; // Search in description
}

/**
 * Activity Log Pagination Options
 */
export interface ActivityLogPagination {
  page?: number;
  limit?: number;
  cursor?: string; // For cursor-based pagination
}

/**
 * Activity Log Response
 */
export interface ActivityLogResponse {
  logs: IActivityLog[];
  pagination: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    nextCursor?: string;
  };
}

