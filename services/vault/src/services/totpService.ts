/**
 * TOTP (Time-based One-Time Password) Service
 * 
 * Handles TOTP secret generation, verification, and backup code management
 * Implements RFC 6238 standard for TOTP
 * 
 * Features:
 * - Generate TOTP secrets
 * - Verify TOTP tokens
 * - Generate backup codes
 * - Verify backup codes
 */

import speakeasy from 'speakeasy';
import bcrypt from 'bcryptjs';
import logger from '../logger';

/**
 * Generate a new TOTP secret
 * @param email - User's email for QR code label
 * @param issuer - Application name (e.g., "Vault App")
 * @returns Object with secret, QR code URL, and backup codes
 */
export const generateTOTPSecret = (
  email: string,
  issuer: string = 'Vault App'
): {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
} => {
  // Generate a 32-character base32 secret
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${email})`,
    issuer,
    length: 32,
  });

  // Generate 8 backup codes (each 10 digits)
  const backupCodes = Array.from({ length: 8 }, () => {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
  });

  return {
    secret: secret.base32 || '',
    otpauthUrl: secret.otpauth_url || '',
    backupCodes,
  };
};

/**
 * Verify a TOTP token
 * @param token - 6-digit TOTP code from user
 * @param secret - User's TOTP secret (base32)
 * @param window - Time window for verification (default: 0, only current token)
 * @returns true if token is valid
 */
export const verifyTOTP = (
  token: string,
  secret: string,
  window: number = 0
): boolean => {
  try {
    // Verify the token with window=0 (only current time step, no tolerance)
    // This ensures only the current 30-second window token is accepted
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window, // window=0 means only current time step (strict verification)
    });

    return verified === true;
  } catch (error) {
    logger.error(`TOTP verification error: ${error}`);
    return false;
  }
};

/**
 * Generate a current TOTP code (for testing/debugging)
 * @param secret - User's TOTP secret (base32)
 * @returns 6-digit TOTP code
 */
export const getTOTPCode = (secret: string): string => {
  try {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
    });
  } catch (error) {
    logger.error(`TOTP code generation error: ${error}`);
    throw error;
  }
};

/**
 * Hash a backup code using bcrypt
 * @param code - Plain backup code
 * @returns Hashed backup code
 */
export const hashBackupCode = async (code: string): Promise<string> => {
  const saltRounds = 10;
  return bcrypt.hashSync(code, saltRounds);
};

/**
 * Verify a backup code against hashed codes
 * @param code - Plain backup code from user
 * @param hashedCodes - Array of hashed backup codes
 * @param usedCodes - Array of hashed used backup codes (to prevent reuse)
 * @returns true if code is valid and not used
 */
export const verifyBackupCode = async (
  code: string,
  hashedCodes: string[],
  usedCodes: string[] = []
): Promise<boolean> => {
  try {
    // Check each hashed code
    for (const hashedCode of hashedCodes) {
      // Check if this code was already used
      const isUsed = usedCodes.some((used) => 
        bcrypt.compareSync(code, used)
      );
      
      if (isUsed) {
        continue; // Skip already used codes
      }

      // Compare the provided code with the hashed code
      const isValid = bcrypt.compareSync(code, hashedCode);
      
      if (isValid) {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error(`Backup code verification error: ${error}`);
    return false;
  }
};

/**
 * Hash all backup codes for storage
 * @param codes - Array of plain backup codes
 * @returns Array of hashed backup codes
 */
export const hashBackupCodes = async (codes: string[]): Promise<string[]> => {
  return codes.map((code) => bcrypt.hashSync(code, 10));
};

/**
 * Mark a backup code as used
 * @param code - Plain backup code
 * @param hashedCodes - Array of all hashed backup codes
 * @returns The hashed version of the used code
 */
export const markBackupCodeAsUsed = async (
  code: string,
  hashedCodes: string[]
): Promise<string | null> => {
  try {
    // Find which hashed code matches
    for (const hashedCode of hashedCodes) {
      const isValid = bcrypt.compareSync(code, hashedCode);
      if (isValid) {
        return hashedCode; // Return the hashed version to store in usedCodes
      }
    }
    return null;
  } catch (error) {
    logger.error(`Error marking backup code as used: ${error}`);
    return null;
  }
};

