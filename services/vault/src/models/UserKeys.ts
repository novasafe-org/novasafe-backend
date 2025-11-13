/**
 * User Keys Model Interface
 * 
 * Stores public/private key pairs for each user.
 * Public key is stored in plain text (used for key wrapping).
 * Private key is encrypted with user's master key (stored client-side).
 */

import { ObjectId } from 'mongodb';

export interface IUserKeys {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User's MongoDB ObjectId
   * References the User collection
   */
  userId: ObjectId | string;

  /**
   * Public key for key wrapping (encrypting keys for sharing)
   * Stored in plain text (PEM format or JWK)
   * Base64 encoded
   */
  publicKey: string;

  /**
   * Public key format/algorithm
   * e.g., 'RSA-OAEP', 'ECDH', 'AES-KW'
   * Default: 'RSA-OAEP'
   */
  keyAlgorithm?: string;

  /**
   * Timestamp when the key pair was generated
   */
  createdAt: Date | string;

  /**
   * Timestamp when the public key was last updated
   */
  updatedAt: Date | string;

  /**
   * Whether the key pair is active
   * Can be rotated by generating new keys
   * Default: true
   */
  active: boolean;
}

