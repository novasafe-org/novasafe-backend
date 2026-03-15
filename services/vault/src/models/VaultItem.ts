/**
 * Vault Item Model Interface
 * 
 * Represents an encrypted vault item in the system.
 * All sensitive data is encrypted client-side using AES-256-GCM before storage.
 * Only encrypted blobs and metadata are stored in the database.
 */

import { ObjectId } from 'mongodb';

export interface IVaultItem {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * Workspace ID (preferred). Vault data is scoped by workspace.
   */
  workspaceId?: ObjectId | string;

  /**
   * User's MongoDB ObjectId who owns this item
   * References the User collection
   */
  userId: ObjectId | string;

  // ============================================
  // Level 1: Encryption Infrastructure
  // ============================================
  
  /**
   * Base64 encoded AES-256-GCM ciphertext
   * Contains all encrypted vault item data (fields, attachments metadata, etc.)
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
   * Item title (optional, can be encrypted too)
   * Stored as plain text for quick filtering and search
   * User can choose to encrypt this field for extra security
   */
  title?: string;

  /**
   * Item category (e.g., 'password', 'credit_card', 'note')
   * Stored as plain text for filtering
   */
  category: string;

  /**
   * Folder ID this item belongs to (optional)
   * References the Folder collection
   */
  folderId?: ObjectId | string;

  /**
   * Array of tags for organization (optional)
   * Can be encrypted if user opts in
   */
  tags?: string[];

  // ============================================
  // Metadata Counts
  // ============================================
  
  /**
   * Number of encrypted fields in this item
   * Used for UI display and validation
   */
  field_count: number;

  /**
   * Number of attachments linked to this item
   * Used for UI display
   */
  attachment_count: number;

  /**
   * Array of file attachment metadata
   * Files are stored on disk, metadata stored in MongoDB
   */
  attachments?: Array<{
    originalName: string;
    storedName: string;
    mimeType: string;
    fileSize: number;
    compressedSize?: number;
    filePath: string;
    compressed: boolean;
    createdAt: Date;
    compressionAlgorithm?: 'gzip' | 'zlib' | 'sharp' | null;
  }>;

  // ============================================
  // Flags & Status
  // ============================================
  
  /**
   * Whether this item is marked as favorite
   * Default: false
   */
  isFavorite?: boolean;

  /**
   * Soft delete flag
   * Items are not permanently deleted, just marked as deleted
   * Default: false
   * When user deletes: deleted = false, deleted_at = NOW()
   * After 30 days: deleted = true (permanent deletion)
   */
  deleted?: boolean;

  /**
   * Timestamp when the item was soft-deleted
   * Used for 30-day retention period before permanent deletion
   * NULL if item is not deleted
   */
  deleted_at?: Date | string | null;

  // ============================================
  // Timestamps
  // ============================================
  
  /**
   * Timestamp when the item was created
   */
  createdAt: Date | string;

  /**
   * Timestamp when the item was last updated
   */
  updatedAt: Date | string;

  /**
   * Timestamp when the item was last accessed
   * Used for tracking frequently accessed items
   * Optional: null if never accessed
   */
  lastAccessedAt?: Date | string | null;

  /**
   * Number of times this item has been accessed
   * Used for tracking most frequently accessed items
   * Default: 0
   */
  accessCount?: number;
}

