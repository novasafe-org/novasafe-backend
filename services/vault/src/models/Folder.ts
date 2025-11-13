/**
 * Folder Model Interface
 * 
 * Represents a folder in the vault system for organizing items.
 * Each folder belongs to a specific user and tracks access frequency.
 * Supports optional encryption for folder names and descriptions (Level 6).
 */

export interface IFolder {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: any;

  /**
   * User's MongoDB ObjectId who owns this folder
   * References the User collection
   */
  userId: string;

  /**
   * Folder name (required)
   * If isEncrypted is true, this field is ignored and encrypted_name is used
   */
  name: string;

  /**
   * Optional folder description
   * If isEncrypted is true, this field is ignored and encrypted_description is used
   */
  description?: string;

  /**
   * Timestamp of when the folder was created
   */
  createdAt: Date | string;

  /**
   * Timestamp of last update to folder record
   */
  updatedAt: Date | string;

  /**
   * Number of times this folder has been accessed
   * Used for tracking most frequently used folders
   * Default: 0
   */
  accessCount: number;

  // ============================================
  // Level 6: Optional Folder Encryption
  // ============================================
  
  /**
   * Whether folder name and description are encrypted
   * Default: false
   * Users can opt-in to encrypt folder names for extra security
   */
  isEncrypted?: boolean;

  /**
   * Encrypted folder name (Base64 encoded AES-256-GCM ciphertext)
   * Used when isEncrypted is true
   * Optional: null if encryption not enabled
   */
  encrypted_name?: string | null;

  /**
   * Initialization vector for folder name encryption
   * Base64 encoded 12-byte IV
   * Optional: null if encryption not enabled
   */
  name_iv?: string | null;

  /**
   * Encrypted folder description (Base64 encoded AES-256-GCM ciphertext)
   * Used when isEncrypted is true
   * Optional: null if encryption not enabled or no description
   */
  encrypted_description?: string | null;

  /**
   * Initialization vector for folder description encryption
   * Base64 encoded 12-byte IV
   * Optional: null if encryption not enabled or no description
   */
  description_iv?: string | null;
}

