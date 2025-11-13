/**
 * Session Model Interface
 * 
 * Represents an active user session in the system.
 * Tracks JWT tokens, refresh tokens, and device information for session management.
 * Used for multi-device support and session revocation (Level 3).
 */

import { ObjectId } from 'mongodb';

export interface ISession {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User's MongoDB ObjectId who owns this session
   * References the User collection
   */
  userId: ObjectId | string;

  // ============================================
  // Token Management
  // ============================================
  
  /**
   * JWT ID (jti) claim from the JWT token
   * Used for token revocation and session lookup
   * Must be unique
   */
  tokenId: string;

  /**
   * Hashed refresh token
   * Refresh tokens are hashed before storage (bcrypt/Argon2)
   * Used for token rotation and refresh
   */
  refreshTokenHash: string;

  // ============================================
  // Device Information
  // ============================================
  
  /**
   * Human-readable device name
   * e.g., "Chrome on Windows", "Safari on iPhone"
   */
  deviceName: string;

  /**
   * Device type classification
   */
  deviceType: 'desktop' | 'mobile' | 'tablet';

  /**
   * Detailed device information
   */
  deviceInfo: {
    /**
     * Operating system name and version
     * e.g., "Windows 10", "iOS 17.0", "macOS 14.0"
     */
    os: string;

    /**
     * Browser name and version
     * e.g., "Chrome 120", "Safari 17.0", "Firefox 121"
     */
    browser: string;

    /**
     * IP address of the device
     * Used for security monitoring
     */
    ipAddress: string;

    /**
     * Full user agent string
     * Used for detailed device identification
     */
    userAgent: string;
  };

  // ============================================
  // Session Tracking
  // ============================================
  
  /**
   * Timestamp of last activity on this session
   * Updated on each API request
   */
  lastActivity: Date;

  /**
   * Timestamp when session was created
   */
  createdAt: Date;

  /**
   * Timestamp when session expires
   * Used for TTL index (auto-delete after 30 days)
   */
  expiresAt: Date;

  // ============================================
  // Revocation
  // ============================================
  
  /**
   * Whether this session has been revoked
   * Revoked sessions cannot be used for authentication
   * Default: false
   */
  revoked: boolean;

  /**
   * Timestamp when session was revoked
   * Optional: null if session not revoked
   */
  revokedAt?: Date | null;
}

