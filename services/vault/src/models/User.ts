/**
 * User Model Interface
 * 
 * Represents a user in the vault system who authenticates via Google OAuth.
 * This interface defines the structure of user documents stored in MongoDB.
 * Includes all security features: encryption, 2FA, recovery, and account security.
 */

export interface IUser {
  /**
   * Google's unique identifier for the user (from 'sub' claim in Google JWT)
   * Optional: Only present if user signed up with Google
   */
  googleId?: string;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address
   * Verified by Google for OAuth users, verified by OTP for email signup
   */
  email: string;

  /**
   * URL to user's profile picture from Google
   * Optional: Only present if user signed up with Google
   */
  picture?: string;

  /**
   * Signup method: 'google' or 'email'
   * Default: 'email'
   */
  signupMethod?: 'google' | 'email';

  /**
   * Hashed password (bcrypt)
   * Optional: Only present for email signup users
   */
  passwordHash?: string;

  /**
   * Email verification status
   * true: Email is verified (Google OAuth or OTP verified)
   * false: Email not yet verified (for email signup)
   */
  emailVerified?: boolean;

  /**
   * Timestamp when email was verified
   * Optional: null if email not verified
   */
  emailVerifiedAt?: Date | null;

  /**
   * Onboarding completion status
   * true: User has completed onboarding (recovery key generated)
   * false: User is still in onboarding flow
   */
  onboardingCompleted?: boolean;

  /**
   * Selected plan during onboarding
   * 'individual' | 'family' | 'team' | 'business'
   */
  planId?: string;

  /**
   * Company name (for team/business plans)
   * Optional
   */
  companyName?: string;

  /**
   * Phone number (for team/business plans)
   * Optional
   */
  phoneNumber?: string;

  /**
   * Company domain (for business plans)
   * Optional
   */
  companyDomain?: string;

  /**
   * Timestamp of when the user first signed up
   */
  createdAt: Date;

  /**
   * Timestamp of last update to user record
   */
  updatedAt: Date;

  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: any;

  // ============================================
  // Level 1: Encryption Infrastructure
  // ============================================
  
  /**
   * Base64 encoded 32-byte salt for key derivation
   * Used with Argon2id to derive the master encryption key
   * Optional for OAuth-only users (can be null)
   */
  encryptionSalt?: string | null;

  /**
   * Parameters for Argon2id key derivation algorithm
   * Used to derive the master key from user password
   */
  keyDerivationParams?: {
    algorithm: 'argon2id';
    iterations: number;        // Default: 3
    memory: number;            // Default: 65536 KB
    parallelism: number;       // Default: 4
  };

  // ============================================
  // Level 1: Account Security
  // ============================================
  
  /**
   * Number of consecutive failed login attempts
   * Account locks after 5 failed attempts
   * Default: 0
   */
  failedLoginAttempts?: number;

  /**
   * Timestamp when account lock expires
   * Account is locked if current time < accountLockedUntil
   * Optional: null if account is not locked
   */
  accountLockedUntil?: Date | null;

  /**
   * Timestamp of last password change
   * Tracks when user last changed their master password
   * Optional: null if password never changed
   */
  lastPasswordChange?: Date | null;

  /**
   * Hashed password reset token (SHA-256)
   * Used for password reset flow
   * Optional: null if no reset token
   */
  passwordResetToken?: string | null;

  /**
   * Timestamp when password reset token expires
   * Optional: null if no reset token
   */
  passwordResetExpiry?: Date | null;

  // ============================================
  // Level 2: Two-Factor Authentication
  // ============================================
  
  /**
   * Server-encrypted TOTP secret
   * Encrypted with server-side master key
   * Optional: null if 2FA not enabled
   */
  totpSecret?: string | null;

  /**
   * IV (Initialization Vector) for TOTP secret encryption
   * Stored separately for decryption
   * Optional: null if 2FA not enabled
   */
  totpSecretIV?: string | null;

  /**
   * Whether 2FA is enabled for this account
   * Default: false
   */
  totpEnabled?: boolean;

  /**
   * Array of hashed backup codes (8 codes)
   * Each code is hashed with bcrypt/Argon2 before storage
   * Optional: null if 2FA not enabled
   */
  totpBackupCodes?: string[] | null;

  /**
   * Array of used backup code hashes
   * Tracks which backup codes have been used (single-use only)
   * Optional: null if 2FA not enabled
   */
  totpBackupCodesUsed?: string[] | null;

  /**
   * Timestamp when 2FA was enabled
   * Optional: null if 2FA not enabled
   */
  totpEnabledAt?: Date | null;

  /**
   * Timestamp of last successful 2FA verification
   * Used for security monitoring
   * Optional: null if 2FA not enabled
   */
  totpLastVerified?: Date | null;

  // ============================================
  // Level 6: Recovery & Advanced Security
  // ============================================
  
  /**
   * Hashed recovery key (bcrypt/Argon2)
   * Recovery key is shown once to user, never stored unhashed
   * Optional: null if recovery key not generated
   */
  recoveryKeyHash?: string | null;

  /**
   * Timestamp when recovery key was generated
   * Optional: null if recovery key not generated
   */
  recoveryKeyCreatedAt?: Date | null;

  /**
   * Whether recovery key has ever been used
   * Default: false
   */
  recoveryKeyUsed?: boolean;

  /**
   * Timestamp when recovery key was last used
   * Optional: null if recovery key never used
   */
  recoveryKeyUsedAt?: Date | null;

  /**
   * Alternative email for account recovery
   * Used for password reset and security alerts
   * Optional: null if not set
   */
  accountRecoveryEmail?: string | null;

  /**
   * Phone number for SMS recovery (server-encrypted)
   * Encrypted with server-side master key
   * Optional: null if not set
   */
  accountRecoveryPhone?: string | null;
}

/**
 * User Payload Interface
 * 
 * Represents the minimal user information encoded in JWT tokens
 * sent to the frontend for session management.
 */
export interface IUserPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
  preAuth?: boolean; // Indicates if this is a pre-authentication token (for 2FA flow)
}

