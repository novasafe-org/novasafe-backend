/**
 * Machine Authentication Middleware
 * 
 * This middleware handles authentication for machine-to-machine API access.
 * It accepts Personal Access Tokens (PAT) or Service Account credentials.
 * 
 * CRITICAL SECURITY: User JWTs from browser are EXPLICITLY REJECTED.
 * Only PAT tokens or Service Account credentials are allowed.
 * 
 * Token Types:
 * - PAT: Authorization: Bearer <pat_token>
 * - Service Account: Authorization: Basic base64(clientId:clientSecret)
 * 
 * @param requiredScopes - Array of scopes required to access this endpoint
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/generateToken';
import { TokenType } from '../models/PersonalAccessToken';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IPersonalAccessToken } from '../models/PersonalAccessToken';
import { IServiceAccount } from '../models/ServiceAccount';
import bcrypt from 'bcryptjs';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Extended Request interface for machine auth
 */
declare global {
  namespace Express {
    interface Request {
      machineAuth?: {
        type: TokenType;
        userId: string;
        scopes: string[];
        tokenId?: string; // For PAT
        clientId?: string; // For Service Account
      };
    }
  }
}

/**
 * Check if token is a user JWT (browser token)
 * User JWTs have specific issuer/audience claims and are signed with JWT_SECRET
 * PATs are opaque tokens starting with "ns_" prefix
 */
const isUserJWT = (token: string): boolean => {
  // PATs have a specific prefix, so if it doesn't start with "ns_", it might be a JWT
  if (token.startsWith('ns_')) {
    return false; // This is a PAT, not a JWT
  }
  
  try {
    // Try to verify as JWT - if it succeeds, it's a user JWT
    const decoded = verifyToken(token);
    // User JWTs are issued by 'vault-backend' for 'vault-frontend'
    // They have jti (session ID) which PATs don't have
    return true;
  } catch {
    // If verification fails, it's not a valid JWT (might be invalid PAT)
    return false;
  }
};

/**
 * Verify Personal Access Token
 * PATs are opaque tokens stored as hashes in the database
 */
const verifyPAT = async (token: string): Promise<IPersonalAccessToken | null> => {
  try {
    const db = new Database('vault');
    
    // PATs should start with "ns_" prefix
    if (!token.startsWith('ns_')) {
      return null;
    }
    
    // Get all active PATs (not revoked, not expired)
    // We need to check all because we can't query by hash
    const now = new Date();
    const pats = await db.findMany(collection.personalAccessTokens, {
      revokedAt: null,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gte: now } }
      ]
    }) as IPersonalAccessToken[];

    // Try to match the token hash
    for (const pat of pats) {
      // Compare the provided token with the stored hash
      const isValid = await bcrypt.compare(token, pat.hashedToken);
      if (isValid) {
        return pat;
      }
    }

    return null;
  } catch (error: any) {
    logger.error(`Error verifying PAT: ${error.message}`);
    return null;
  }
};

/**
 * Verify Service Account credentials
 */
const verifyServiceAccount = async (
  clientId: string,
  clientSecret: string
): Promise<IServiceAccount | null> => {
  try {
    const db = new Database('vault');
    
    // Find service account by clientId
    const serviceAccount = await db.findOne(collection.serviceAccounts, {
      clientId,
      revokedAt: null
    }) as IServiceAccount | null;

    if (!serviceAccount) {
      return null;
    }

    // Check expiration
    if (serviceAccount.expiresAt && new Date(serviceAccount.expiresAt) < new Date()) {
      return null;
    }

    // Verify client secret hash
    const isValid = await bcrypt.compare(clientSecret, serviceAccount.hashedClientSecret);
    if (!isValid) {
      return null;
    }

    return serviceAccount;
  } catch (error: any) {
    logger.error(`Error verifying service account: ${error.message}`);
    return null;
  }
};

/**
 * Check if required scopes are present in token scopes
 */
const hasRequiredScopes = (tokenScopes: string[], requiredScopes: string[]): boolean => {
  if (requiredScopes.length === 0) {
    return true; // No scopes required
  }
  
  return requiredScopes.every(scope => tokenScopes.includes(scope));
};

/**
 * Machine Authentication Middleware Factory
 * 
 * @param requiredScopes - Array of scopes required (e.g., ['secrets:read'])
 */
export const machineAuthMiddleware = (requiredScopes: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          message: 'Authentication required',
          error: 'No authorization header provided',
          code: 'MACHINE_AUTH_REQUIRED'
        });
        return;
      }

      let machineAuth: {
        type: TokenType;
        userId: string;
        scopes: string[];
        tokenId?: string;
        clientId?: string;
      } | null = null;

      // Check if it's a Bearer token (PAT or user JWT)
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        if (!token) {
          res.status(401).json({
            message: 'Invalid token',
            error: 'No token provided',
            code: 'INVALID_TOKEN'
          });
          return;
        }

        // CRITICAL: Check if this is a user JWT (browser token)
        // User JWTs MUST be rejected for machine endpoints
        if (isUserJWT(token)) {
          res.status(403).json({
            message: 'User JWT not allowed',
            error: 'Machine endpoints require Personal Access Token (PAT) or Service Account credentials. User JWTs from browser are not permitted.',
            code: 'USER_JWT_REJECTED'
          });
          return;
        }

        // Try to verify as PAT
        const pat = await verifyPAT(token);
        if (pat) {
          machineAuth = {
            type: TokenType.PAT,
            userId: pat.userId,
            scopes: pat.scopes,
            tokenId: pat._id?.toString()
          };

          // Update last used timestamp (fire and forget)
          const db = new Database('vault');
          db.updateOne(
            collection.personalAccessTokens,
            { _id: pat._id },
            {
              $set: {
                lastUsedAt: new Date(),
                lastUsedIp: req.ip || req.socket.remoteAddress,
                lastUsedUserAgent: req.headers['user-agent']
              }
            }
          ).catch(() => {
            // Silently fail - activity update is not critical
          });
        } else {
          res.status(401).json({
            message: 'Invalid token',
            error: 'Token is not a valid Personal Access Token',
            code: 'INVALID_PAT'
          });
          return;
        }
      }
      // Check if it's Basic auth (Service Account)
      else if (authHeader.startsWith('Basic ')) {
        const credentials = authHeader.substring(6);
        const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
        const [clientId, clientSecret] = decoded.split(':');

        if (!clientId || !clientSecret) {
          res.status(401).json({
            message: 'Invalid credentials',
            error: 'Invalid Basic auth format. Expected: base64(clientId:clientSecret)',
            code: 'INVALID_BASIC_AUTH'
          });
          return;
        }

        const serviceAccount = await verifyServiceAccount(clientId, clientSecret);
        if (serviceAccount) {
          machineAuth = {
            type: TokenType.SERVICE,
            userId: serviceAccount.userId,
            scopes: serviceAccount.scopes,
            clientId: serviceAccount.clientId
          };

          // Update last used timestamp (fire and forget)
          const db = new Database('vault');
          db.updateOne(
            collection.serviceAccounts,
            { _id: serviceAccount._id },
            {
              $set: {
                lastUsedAt: new Date(),
                lastUsedIp: req.ip || req.socket.remoteAddress,
                lastUsedUserAgent: req.headers['user-agent']
              }
            }
          ).catch(() => {
            // Silently fail - activity update is not critical
          });
        } else {
          res.status(401).json({
            message: 'Invalid credentials',
            error: 'Invalid client ID or client secret',
            code: 'INVALID_SERVICE_ACCOUNT'
          });
          return;
        }
      } else {
        res.status(401).json({
          message: 'Invalid authorization format',
          error: 'Authorization header must be "Bearer <token>" or "Basic <credentials>"',
          code: 'INVALID_AUTH_FORMAT'
        });
        return;
      }

      // Check scopes
      if (!hasRequiredScopes(machineAuth.scopes, requiredScopes)) {
        res.status(403).json({
          message: 'Insufficient permissions',
          error: `Required scopes: ${requiredScopes.join(', ')}. Token has: ${machineAuth.scopes.join(', ')}`,
          code: 'INSUFFICIENT_SCOPES'
        });
        return;
      }

      // Attach machine auth info to request
      req.machineAuth = machineAuth;

      // Log machine access for auditing
      logger.info({
        actorType: machineAuth.type,
        actorId: machineAuth.type === TokenType.PAT ? machineAuth.tokenId : machineAuth.clientId,
        userId: machineAuth.userId,
        endpoint: req.path,
        method: req.method,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }, 'Machine API access');

      next();
    } catch (error: any) {
      logger.error(`Machine auth middleware error: ${error.message}`);
      res.status(500).json({
        message: 'Authentication error',
        error: 'An error occurred during authentication'
      });
    }
  };
};

