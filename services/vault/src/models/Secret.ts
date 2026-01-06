/**
 * Secret Model Interface
 * 
 * Represents a secret in the Secrets Manager system.
 * Secrets are encrypted using AES-256-GCM (zero-knowledge architecture).
 * All sensitive data is encrypted client-side before storage.
 */

import { ObjectId } from 'mongodb';

export interface ISecret {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User's MongoDB ObjectId who owns this secret
   * References the User collection
   */
  userId: ObjectId | string;

  // ============================================
  // Encryption Infrastructure
  // ============================================
  
  /**
   * Base64 encoded AES-256-GCM ciphertext
   * Contains all encrypted secret data (value, fields, etc.)
   * Encrypted on client-side before being sent to backend
   */
  encrypted_data: string;

  /**
   * Base64 encoded 12-byte initialization vector (IV)
   * Used for AES-256-GCM encryption
   * Generated client-side using Crypto.getRandomValues()
   */
  iv: string;

  // ============================================
  // Metadata (Plain for Filtering/Search)
  // ============================================
  
  /**
   * Secret name (stored as plain text for quick filtering and search)
   */
  name: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Secret type (e.g., 'api-key', 'token', 'password', 'certificate', etc.)
   * Stored as plain text for filtering
   */
  type: string;

  /**
   * Secret category (e.g., 'aws', 'azure', 'gcp', 'github', etc.)
   * Stored as plain text for filtering
   */
  category: string;

  /**
   * Array of tags for organization (optional)
   */
  tags?: string[];

  /**
   * Number of encrypted fields in this secret
   * Used for UI display and validation
   */
  field_count: number;

  // ============================================
  // Rotation & Expiration
  // ============================================
  
  /**
   * Whether automatic rotation is enabled
   * Default: false
   */
  rotationEnabled?: boolean;

  /**
   * Number of days between rotations (if rotationEnabled is true)
   */
  rotationDays?: number;

  /**
   * Timestamp when the secret was last rotated
   * Optional: null if never rotated
   */
  lastRotatedAt?: Date | string | null;

  /**
   * Timestamp when the secret expires
   * Optional: null if never expires
   */
  expiresAt?: Date | string | null;

  /**
   * Current version number of the secret
   * Increments on each update
   * Default: 1
   */
  version?: number;

  // ============================================
  // Integration & Access
  // ============================================
  
  /**
   * Integration ID if synced with external service (AWS, Azure, GCP, etc.)
   * Optional: null if not synced
   */
  integrationId?: string | null;

  /**
   * Number of times this secret has been accessed
   * Used for tracking most frequently accessed secrets
   * Default: 0
   */
  accessCount?: number;

  /**
   * Timestamp when the secret was last accessed
   * Used for tracking frequently accessed secrets
   * Optional: null if never accessed
   */
  lastAccessedAt?: Date | string | null;

  /**
   * Whether this secret is marked as favorite
   * Default: false
   */
  isFavorite?: boolean;

  /**
   * User ID who created this secret
   * References the User collection
   */
  createdBy?: ObjectId | string;

  /**
   * User ID who last updated this secret
   * References the User collection
   */
  updatedBy?: ObjectId | string;

  // ============================================
  // Timestamps
  // ============================================
  
  /**
   * Timestamp when the secret was created
   */
  createdAt: Date | string;

  /**
   * Timestamp when the secret was last updated
   */
  updatedAt: Date | string;

  /**
   * Soft delete flag
   * Secrets are not permanently deleted, just marked as deleted
   * Default: false
   */
  deleted?: boolean;
}

/**
 * Secret Version Model Interface
 * 
 * Stores version history of secrets for audit and rollback purposes.
 */
export interface ISecretVersion {
  _id?: ObjectId;
  secretId: ObjectId | string;
  userId: ObjectId | string;
  version: number;
  encrypted_data: string;
  iv: string;
  createdAt: Date | string;
  createdBy?: ObjectId | string;
}

/**
 * Secret Access Log Model Interface
 * 
 * Tracks access to secrets for audit and security purposes.
 */
export interface ISecretAccess {
  _id?: ObjectId;
  secretId: ObjectId | string;
  userId: ObjectId | string;
  action: 'view' | 'copy' | 'update' | 'delete' | 'rotate';
  ipAddress?: string;
  userAgent?: string;
  accessedAt: Date | string;
}

