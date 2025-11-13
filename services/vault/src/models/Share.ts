/**
 * Share Model Interface
 * 
 * Represents a shared safe (folder) or item in the vault system.
 * Implements end-to-end encryption where the item's encryption key is
 * wrapped (re-encrypted) with the recipient's public key.
 */

import { ObjectId } from 'mongodb';

export type ShareType = 'item' | 'folder';
export type SharePermission = 'view' | 'edit';

export interface IShare {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User who shared the item/folder (sharer)
   * References the User collection
   */
  sharerId: ObjectId | string;

  /**
   * User who received the share (recipient)
   * References the User collection
   */
  recipientId: ObjectId | string;

  /**
   * Type of share: 'item' or 'folder'
   */
  shareType: ShareType;

  /**
   * ID of the shared item or folder
   * References either vaultItems or folders collection
   */
  resourceId: ObjectId | string;

  /**
   * Permission level: 'view' (read-only) or 'edit' (can modify)
   */
  permission: SharePermission;

  /**
   * Wrapped encryption key for the recipient
   * The item's/folder's encryption key encrypted with recipient's public key
   * Base64 encoded ciphertext
   */
  wrappedKey: string;

  /**
   * Initialization vector for the wrapped key
   * Base64 encoded 12-byte IV
   */
  wrappedKeyIV: string;

  /**
   * Optional message/note from sharer to recipient
   * Plain text (not encrypted)
   */
  message?: string;

  /**
   * Whether the share is active
   * Can be revoked by setting to false
   * Default: true
   */
  active: boolean;

  /**
   * Timestamp when the share was created
   */
  createdAt: Date | string;

  /**
   * Timestamp when the share was last updated
   */
  updatedAt: Date | string;

  /**
   * Timestamp when the share was revoked (if applicable)
   * Optional: null if share is still active
   */
  revokedAt?: Date | string | null;

  /**
   * Integrity hash of the shared resource
   * Used to verify tampering
   * Base64 encoded SHA-256 hash
   */
  integrityHash?: string;
}

