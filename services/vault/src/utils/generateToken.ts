import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IUser, IUserPayload } from '../models/User';

/**
 * Generate JWT Token Utility
 * 
 * This utility creates secure JWT tokens for authenticated users.
 * The token contains minimal user information and is signed with a secret key.
 * 
 * SECURITY NOTES:
 * - Never include sensitive data (passwords, full user objects) in JWT payload
 * - JWT_SECRET must be a strong, random string stored securely in .env
 * - Tokens are stateless; server doesn't track them (logout is client-side)
 * - For production, consider using refresh tokens for better security
 * 
 * @param user - The authenticated user object from database
 * @returns Signed JWT token string valid for 7 days
 */
export interface TokenWithSessionId {
  token: string;
  tokenId: string; // JWT ID (jti) for session tracking
}

export const generateToken = (user: IUser, tokenId?: string, isPreAuth?: boolean): TokenWithSessionId => {
  // Ensure JWT_SECRET is configured
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }

  // Generate unique token ID (jti) for session tracking
  const jti = tokenId || crypto.randomBytes(16).toString('hex');

  // Create minimal payload to keep token size small
  // Note: jti is added via jwtid option, not in payload
  const payload: IUserPayload & { preAuth?: boolean } = {
    id: user._id?.toString() || user.googleId || '',
    email: user.email,
    name: user.name,
    picture: user.picture,
    preAuth: isPreAuth || false, // Mark as pre-auth token if 2FA is required
  };

  // Sign the token with our secret key
  // Pre-auth tokens expire in 10 minutes (for 2FA verification)
  // Full tokens expire in 7 days (604800 seconds)
  // jwtid option automatically adds 'jti' claim to the payload
  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: isPreAuth ? '10m' : '7d', // Pre-auth tokens expire quickly
      issuer: 'vault-backend',
      audience: 'vault-frontend',
      jwtid: jti, // JWT ID claim (automatically added to payload)
    }
  );

  return { token, tokenId: jti };
};

/**
 * Verify JWT Token Utility
 * 
 * Verifies and decodes a JWT token to extract user payload.
 * Throws an error if token is invalid, expired, or tampered with.
 * 
 * @param token - The JWT token string to verify
 * @returns Decoded user payload if token is valid
 * @throws Error if token is invalid or JWT_SECRET is not configured
 */
export const verifyToken = (token: string): IUserPayload & { jti?: string } => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }

  try {
    // Verify token signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'vault-backend',
      audience: 'vault-frontend'
    }) as IUserPayload & { jti?: string };

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
};

