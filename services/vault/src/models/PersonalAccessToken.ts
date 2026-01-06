/**
 * Personal Access Token (PAT) Model Interface
 * 
 * Represents a long-lived token for machine-to-machine API access.
 * PATs are NOT JWTs - they are opaque tokens stored as hashes in the database.
 * 
 * SECURITY:
 * - Tokens are hashed before storage (never store plain tokens)
 * - Scoped access (can only access specific resources)
 * - Revocable at any time
 * - Tracked usage for auditing
 */

export interface IPersonalAccessToken {
  /**
   * MongoDB ObjectId
   */
  _id?: any;

  /**
   * User-friendly name for the token (e.g., "CI/CD Pipeline", "GitHub Actions")
   */
  name: string;

  /**
   * Hashed token value (bcrypt/argon2)
   * The plain token is shown once during creation, then only the hash is stored
   */
  hashedToken: string;

  /**
   * User ID who owns this PAT
   */
  userId: string;

  /**
   * Array of scopes this token can access
   * Examples: ['secrets:read', 'secrets:write', 'secrets:rotate', 'integrations:sync']
   */
  scopes: string[];

  /**
   * Optional expiration date
   * null = never expires
   */
  expiresAt?: Date | null;

  /**
   * Timestamp of last token usage
   * Updated on each API request
   */
  lastUsedAt?: Date | null;

  /**
   * IP address of last usage
   */
  lastUsedIp?: string | null;

  /**
   * User agent of last usage
   */
  lastUsedUserAgent?: string | null;

  /**
   * Timestamp when token was created
   */
  createdAt: Date;

  /**
   * Timestamp when token was last updated
   */
  updatedAt: Date;

  /**
   * Timestamp when token was revoked
   * null = active, Date = revoked
   */
  revokedAt?: Date | null;

  /**
   * Reason for revocation (if revoked)
   */
  revocationReason?: string | null;
}

/**
 * PAT Creation Response
 * Contains the plain token (shown once) and metadata
 */
export interface IPATCreationResponse {
  id: string;
  name: string;
  token: string; // Plain token - shown only once
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
  warning: string; // "Store this token securely. It will not be shown again."
}

/**
 * Token Type Enum
 */
export enum TokenType {
  USER = "user",      // User JWT from browser
  PAT = "pat",        // Personal Access Token
  SERVICE = "service" // Service Account (Client ID + Secret)
}


