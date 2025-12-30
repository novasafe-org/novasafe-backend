/**
 * OTP (One-Time Password) Model Interface
 * 
 * Represents email verification OTPs sent during onboarding
 */

export interface IOTP {
  /**
   * Email address the OTP is sent to
   */
  email: string;

  /**
   * 6-digit OTP code (hashed before storage)
   */
  otpHash: string;

  /**
   * Timestamp when OTP was created
   */
  createdAt: Date;

  /**
   * Timestamp when OTP expires (default: 10 minutes)
   */
  expiresAt: Date;

  /**
   * Whether OTP has been verified
   */
  verified: boolean;

  /**
   * Timestamp when OTP was verified
   * Optional: null if not verified
   */
  verifiedAt?: Date | null;

  /**
   * Number of verification attempts
   * OTP is invalidated after 5 failed attempts
   */
  attempts: number;

  /**
   * Purpose of the OTP (e.g., 'email_verification', 'password_reset')
   */
  purpose: 'email_verification' | 'password_reset';

  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: any;
}

