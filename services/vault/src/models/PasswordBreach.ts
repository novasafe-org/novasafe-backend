/**
 * Password Breach Model Interface
 * 
 * Represents a cached password breach check result.
 * Used for caching HaveIBeenPwned API responses to reduce API calls.
 * Implements k-anonymity for privacy (Level 5).
 */

import { ObjectId } from 'mongodb';

export interface IPasswordBreach {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  // ============================================
  // K-anonymity Hash
  // ============================================
  
  /**
   * First 5 hex characters of SHA-1 password hash
   * Used for k-anonymity with HaveIBeenPwned API
   * Pattern: ^[0-9a-fA-F]{5}$
   * Must be unique
   */
  hashPrefix: string;

  // ============================================
  // Breach Results
  // ============================================
  
  /**
   * Number of times this hash prefix appeared in breaches
   * From HaveIBeenPwned API response
   * Minimum: 0
   */
  breachCount: number;

  /**
   * Timestamp when this breach check was performed
   * Used for TTL index (auto-delete after 7 days)
   */
  lastChecked: Date;

  // ============================================
  // Metadata
  // ============================================
  
  /**
   * Array of full SHA-1 hashes that were checked
   * Used for deduplication and tracking
   * Optional: null if no hashes checked yet
   */
  checkedHashes?: string[] | null;
}

