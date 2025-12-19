/**
 * Hash Generator Utility
 * 
 * Generates and verifies SHA-512 hashes according to PayU specification.
 * PayU uses: SHA512(key|txnid|amount|productinfo|firstname|email|salt)
 */

import crypto from 'crypto';
import logger from '../logger';

/**
 * Generate PayU hash for payment request
 * 
 * PayU hash format: SHA512(key|txnid|amount|productinfo|firstname|email|salt)
 * 
 * @param params - Hash parameters
 * @param salt - Merchant salt
 * @returns SHA-512 hash in lowercase hex
 */
export function generatePayUHash(
  params: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    salt: string;
    phone?: string;
    surl?: string;
    furl?: string;
  },
  salt: string
): string {
  try {
    // Build hash string in PayU order: key|txnid|amount|productinfo|firstname|email|salt
    const hashString = [
      params.key,
      params.txnid,
      params.amount,
      params.productinfo,
      params.firstname,
      params.email,
      salt,
    ].join('|');

    // Generate SHA-512 hash
    const hash = crypto
      .createHash('sha512')
      .update(hashString)
      .digest('hex')
      .toLowerCase();

    logger.debug(`Generated PayU hash for txnid: ${params.txnid}`);
    return hash;
  } catch (error: any) {
    logger.error(error, 'Error generating PayU hash');
    throw new Error(`Hash generation failed: ${error.message}`);
  }
}

/**
 * Verify PayU response hash
 * 
 * PayU response hash format: SHA512(salt|status|||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * 
 * @param params - Response parameters from PayU
 * @param salt - Merchant salt
 * @param receivedHash - Hash received from PayU
 * @returns true if hash is valid
 */
export function verifyPayUHash(
  params: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    status: string;
    salt: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
  },
  salt: string,
  receivedHash: string
): boolean {
  try {
    // Build hash string in PayU response order
    const hashString = [
      salt,
      params.status,
      params.udf5 || '',
      params.udf4 || '',
      params.udf3 || '',
      params.udf2 || '',
      params.udf1 || '',
      params.email,
      params.firstname,
      params.productinfo,
      params.amount,
      params.txnid,
      params.key,
    ].join('|');

    // Generate expected hash
    const expectedHash = crypto
      .createHash('sha512')
      .update(hashString)
      .digest('hex')
      .toLowerCase();

    // Compare hashes (case-insensitive)
    const isValid = expectedHash.toLowerCase() === receivedHash.toLowerCase();

    if (!isValid) {
      logger.warn(`PayU hash verification failed for txnid: ${params.txnid}`);
      logger.debug(`Expected: ${expectedHash}, Received: ${receivedHash}`);
    } else {
      logger.debug(`PayU hash verified successfully for txnid: ${params.txnid}`);
    }

    return isValid;
  } catch (error: any) {
    logger.error(error, 'Error verifying PayU hash');
    return false;
  }
}

/**
 * Generate hash for PayU API requests (alternative format)
 * Used for verify_payment and other API calls
 */
export function generatePayUApiHash(
  params: Record<string, string>,
  salt: string
): string {
  try {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(params).sort();
    
    // Build hash string: key1value1|key2value2|...|salt
    const hashString = sortedKeys
      .map((key) => `${key}${params[key]}`)
      .join('|') + `|${salt}`;

    // Generate SHA-512 hash
    const hash = crypto
      .createHash('sha512')
      .update(hashString)
      .digest('hex')
      .toLowerCase();

    return hash;
  } catch (error: any) {
    logger.error(error, 'Error generating PayU API hash');
    throw new Error(`API hash generation failed: ${error.message}`);
  }
}


