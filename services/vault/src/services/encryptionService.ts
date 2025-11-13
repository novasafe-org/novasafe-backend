/**
 * Server-Side Encryption Service
 * 
 * Encrypts sensitive server-side data (2FA secrets, recovery keys, etc.)
 * Uses AES-256-GCM encryption with a server master key
 * 
 * IMPORTANT: Store SERVER_MASTER_KEY in environment variables or secrets manager
 */

import crypto from 'crypto';
import logger from '../logger';

// Get server master key from environment
// In production, use a secrets manager (AWS Secrets Manager, Azure Key Vault, etc.)
const SERVER_MASTER_KEY = process.env.SERVER_MASTER_KEY || crypto.randomBytes(32).toString('hex');

if (!process.env.SERVER_MASTER_KEY) {
  logger.warn('SERVER_MASTER_KEY not set in environment. Using random key (not persistent).');
}

/**
 * Encrypt server-side secret (e.g., TOTP secret)
 * @param plaintext - Secret to encrypt
 * @returns Object with ciphertext and IV
 */
export const encryptServerSecret = (plaintext: string): { ciphertext: string; iv: string } => {
  try {
    // Derive encryption key from master key
    const key = crypto.scryptSync(SERVER_MASTER_KEY, 'salt', 32);
    
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine auth tag with ciphertext
    const encrypted = Buffer.concat([
      Buffer.from(authTag),
      Buffer.from(ciphertext, 'base64')
    ]).toString('base64');
    
    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
    };
  } catch (error) {
    logger.error(`Server secret encryption error: ${error}`);
    throw new Error('Failed to encrypt server secret');
  }
};

/**
 * Decrypt server-side secret
 * @param ciphertext - Encrypted secret with auth tag
 * @param iv - Initialization vector (base64)
 * @returns Decrypted plaintext
 */
export const decryptServerSecret = (ciphertext: string, iv: string): string => {
  try {
    // Derive encryption key from master key
    const key = crypto.scryptSync(SERVER_MASTER_KEY, 'salt', 32);
    
    // Decode IV
    const ivBuffer = Buffer.from(iv, 'base64');
    
    // Decode ciphertext
    const encryptedBuffer = Buffer.from(ciphertext, 'base64');
    
    // Extract auth tag (first 16 bytes) and actual ciphertext
    const authTag = encryptedBuffer.slice(0, 16);
    const actualCiphertext = encryptedBuffer.slice(16);
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let plaintext = decipher.update(actualCiphertext, undefined, 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  } catch (error) {
    logger.error(`Server secret decryption error: ${error}`);
    throw new Error('Failed to decrypt server secret');
  }
};

/**
 * Rotate server master key (requires re-encryption of all secrets)
 * This is a complex operation that should be done carefully
 */
export const rotateServerKey = async (): Promise<void> => {
  // TODO: Implement key rotation
  // This requires:
  // 1. Generate new master key
  // 2. Decrypt all secrets with old key
  // 3. Re-encrypt with new key
  // 4. Update database
  // 5. Update environment variable
  logger.warn('Key rotation not yet implemented');
  throw new Error('Key rotation not yet implemented');
};

