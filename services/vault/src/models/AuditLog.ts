/**
 * Audit Log Model Interface
 * 
 * Represents an audit log entry for tracking user actions.
 * All user activities are logged for security monitoring and compliance.
 * Used for security audits, activity history, and breach detection (Level 4).
 */

import { ObjectId } from 'mongodb';

export interface IAuditLog {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User's MongoDB ObjectId who performed the action
   * References the User collection
   */
  userId: ObjectId | string;

  /**
   * Session token ID (JWT jti) where action was performed
   * References the Session collection
   * Used for tracking actions by session
   */
  sessionId: string;

  // ============================================
  // Action Details
  // ============================================
  
  /**
   * Type of action performed
   */
  action: 
    | 'view'              // View vault item
    | 'edit'              // Edit vault item
    | 'delete'            // Delete vault item
    | 'create'            // Create vault item
    | 'export'            // Export vault data
    | 'import'            // Import vault data
    | 'login'             // User login
    | 'logout'            // User logout
    | 'password_change'   // Master password changed
    | '2fa_enabled'      // 2FA enabled
    | '2fa_disabled'     // 2FA disabled
    | 'session_revoked'   // Session revoked
    | 'backup'            // Vault backup created
    | 'restore';          // Vault restored

  /**
   * Vault item ID (if action involves a specific item)
   * References the VaultItem collection
   * Optional: null if action doesn't involve an item
   */
  itemId?: ObjectId | string | null;

  /**
   * Type of item involved (if applicable)
   * e.g., 'password', 'credit_card', 'note', 'document'
   * Optional: null if action doesn't involve an item
   */
  itemType?: string | null;

  // ============================================
  // Security Context
  // ============================================
  
  /**
   * Whether this action involved encrypted data
   * Used for security monitoring and compliance
   */
  encrypted: boolean;

  /**
   * IP address where action was performed
   * Used for security monitoring
   */
  ipAddress: string;

  /**
   * User agent string of the device
   * Used for device identification
   */
  userAgent: string;

  /**
   * Device information
   */
  deviceInfo: {
    /**
     * Device name
     * e.g., "Chrome on Windows"
     */
    name: string;

    /**
     * Device type
     * e.g., "desktop", "mobile", "tablet"
     */
    type: string;

    /**
     * Operating system
     * e.g., "Windows 10", "iOS 17.0"
     */
    os: string;
  };

  // ============================================
  // Timestamp
  // ============================================
  
  /**
   * Timestamp when action was performed
   * Used for TTL index (auto-delete after 2 years)
   */
  timestamp: Date;

  // ============================================
  // Additional Context
  // ============================================
  
  /**
   * Flexible metadata field for additional context
   * Can store any JSON-serializable data
   * Optional: null if no additional metadata
   */
  metadata?: Record<string, any> | null;
}

