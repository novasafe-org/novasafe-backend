/**
 * Service Account Model Interface
 * 
 * Represents a service account for CI/CD, automation, and cloud integrations.
 * Uses Client ID + Client Secret authentication (OAuth2 client credentials flow).
 * 
 * SECURITY:
 * - Client secrets are hashed before storage
 * - Scoped access per environment
 * - Revocable at any time
 * - Tracked usage for auditing
 */

export interface IServiceAccount {
  /**
   * MongoDB ObjectId
   */
  _id?: any;

  /**
   * User-friendly name for the service account
   * Examples: "Production CI/CD", "Staging Deploy", "AWS Lambda"
   */
  name: string;

  /**
   * Unique client ID (public identifier)
   * Used in Authorization: Basic base64(clientId:clientSecret)
   */
  clientId: string;

  /**
   * Hashed client secret (bcrypt/argon2)
   * The plain secret is shown once during creation
   */
  hashedClientSecret: string;

  /**
   * User/Organization ID who owns this service account
   */
  userId: string;

  /**
   * Array of scopes this service account can access
   * Examples: ['secrets:read', 'secrets:write', 'integrations:sync']
   */
  scopes: string[];

  /**
   * Allowed environments/IPs for this service account
   * Can restrict to specific environments (production, staging, etc.)
   */
  allowedEnvironments?: string[];

  /**
   * Allowed IP addresses/CIDR blocks
   * Optional: null = no IP restriction
   */
  allowedIpRanges?: string[];

  /**
   * Optional expiration date for the client secret
   * null = never expires
   */
  expiresAt?: Date | null;

  /**
   * Timestamp of last usage
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
   * Timestamp when service account was created
   */
  createdAt: Date;

  /**
   * Timestamp when service account was last updated
   */
  updatedAt: Date;

  /**
   * Timestamp when service account was revoked
   * null = active, Date = revoked
   */
  revokedAt?: Date | null;

  /**
   * Reason for revocation (if revoked)
   */
  revocationReason?: string | null;
}

/**
 * Service Account Creation Response
 * Contains the plain client secret (shown once) and metadata
 */
export interface IServiceAccountCreationResponse {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string; // Plain secret - shown only once
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
  warning: string; // "Store this secret securely. It will not be shown again."
}


