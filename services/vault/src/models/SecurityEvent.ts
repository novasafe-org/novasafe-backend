/**
 * Security Event Model Interface
 * 
 * Represents a security-related event in the system.
 * Used for monitoring, alerting, and detecting suspicious activity.
 * Includes failed logins, breach detection, and account security events (Level 5).
 */

import { ObjectId } from 'mongodb';

export interface ISecurityEvent {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User's MongoDB ObjectId (if event is user-specific)
   * References the User collection
   * Optional: null for anonymous events (e.g., failed login attempts)
   */
  userId?: ObjectId | string | null;

  // ============================================
  // Event Classification
  // ============================================
  
  /**
   * Type of security event
   */
  type: 
    | 'failed_login'         // Failed login attempt
    | 'suspicious_activity'  // Suspicious user activity detected
    | 'breach_detected'      // Password breach detected
    | 'password_change'      // Password changed
    | '2fa_enabled'          // 2FA enabled
    | 'session_revoked'     // Session revoked
    | 'rate_limit_exceeded' // API rate limit exceeded
    | 'invalid_token'        // Invalid/expired token used
    | 'account_locked';      // Account locked due to security

  /**
   * Severity level of the event
   */
  severity: 'low' | 'medium' | 'high' | 'critical';

  // ============================================
  // Event Details
  // ============================================
  
  /**
   * Human-readable description of the event
   */
  description: string;

  /**
   * IP address where event occurred
   * Used for security monitoring
   */
  ipAddress: string;

  /**
   * User agent string
   * Used for device identification
   */
  userAgent: string;

  /**
   * Additional metadata about the event
   * Can store any JSON-serializable data
   * Optional: null if no additional metadata
   */
  metadata?: Record<string, any> | null;

  // ============================================
  // Timestamp
  // ============================================
  
  /**
   * Timestamp when event occurred
   * Used for TTL index (auto-delete after 1 year)
   */
  timestamp: Date;

  // ============================================
  // Resolution
  // ============================================
  
  /**
   * Whether this event has been resolved
   * Default: false
   */
  resolved: boolean;

  /**
   * Timestamp when event was resolved
   * Optional: null if event not resolved
   */
  resolvedAt?: Date | null;

  /**
   * Admin user ID who resolved the event (if applicable)
   * References the User collection
   * Optional: null if auto-resolved or not resolved
   */
  resolvedBy?: ObjectId | string | null;
}

