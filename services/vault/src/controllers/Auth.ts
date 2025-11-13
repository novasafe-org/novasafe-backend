import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ObjectId } from 'mongodb';
import { DBCONFIG } from '../../config/config';
import Database from '../../database/connection';
import { IUser } from '../models/User';
import { generateToken } from '../utils/generateToken';
import { createSession, revokeSession, getSessionByTokenId } from '../services/sessionService';
import { getClientIP, parseBrowser, parseOS, detectDevice } from '../utils/deviceDetection';
import { saveUserPublicKey } from '../services/shareService';
import logger from '../logger';
import crypto from 'crypto';

// Initialize Google OAuth2 client
// This client is used to verify Google ID tokens sent from the frontend
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const collection = DBCONFIG.vault.collections;

/**
 * Google Sign-In Controller
 * 
 * This endpoint handles the Google OAuth authentication flow.
 * It receives a Google credential (ID token), verifies it with Google,
 * creates or retrieves the user, and issues a JWT session token.
 * 
 * FLOW:
 * 1. Frontend uses @react-oauth/google to get Google credential
 * 2. Frontend sends credential to this endpoint
 * 3. Backend verifies credential with Google
 * 4. Backend creates/retrieves user from database
 * 5. Backend issues JWT token for app sessions
 * 6. Frontend stores JWT token and uses it for authenticated requests
 * 
 * SECURITY NOTES:
 * - Always verify the token audience matches your GOOGLE_CLIENT_ID
 * - Never trust the token without verification
 * - The Google credential should be used ONLY for verification, not storage
 * - Issue your own JWT tokens for session management
 * 
 * @route POST /auth/google
 * @access Public
 */
export const googleSignIn = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract the Google credential (ID token) from request body
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ 
        message: 'Bad Request',
        error: 'Google credential is required'
      });
      return;
    }

    // Verify required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      logger.error('GOOGLE_CLIENT_ID environment variable is not configured');
      res.status(500).json({ 
        message: 'Server configuration error',
        error: 'Google authentication is not properly configured'
      });
      return;
    }

    // Step 1: Verify the Google ID token with Google's servers
    // This ensures the token is legitimate and hasn't been tampered with
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID, // Verify this token was issued for YOUR app
    });

    // Step 2: Extract user information from the verified token
    const payload = ticket.getPayload();

    if (!payload) {
      res.status(401).json({ 
        message: 'Authentication failed',
        error: 'Unable to extract user information from Google token'
      });
      return;
    }

    // Extract user details from Google payload
    const {
      sub: googleId,        // Google's unique user ID
      email,                 // User's email (verified by Google)
      name,                  // User's full name
      picture,               // Profile picture URL
    } = payload;

    if (!googleId || !email || !name) {
      res.status(401).json({ 
        message: 'Authentication failed',
        error: 'Incomplete user information from Google'
      });
      return;
    }

    // Step 3: Check if user already exists in our database
    const db = new Database('vault');
    let user = await db.findOne(collection.vaultUsers, { googleId }) as IUser | null;

    // Step 4: Create new user if they don't exist (first-time sign-in)
    const isFirstTime = !user;
    
    if (!user) {
      logger.info(`Creating new user with email: ${email}`);
      
      const newUser: Omit<IUser, '_id'> = {
        googleId,
        email,
        name,
        picture,
        totpEnabled: false,
        failedLoginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.insertOne(collection.vaultUsers, newUser);
      
      // Retrieve the newly created user with MongoDB's _id
      user = {
        ...newUser,
        _id: result.insertedId,
      } as IUser;

      logger.info(`New user created successfully with ID: ${result.insertedId}`);

      // Automatically generate and save RSA key pair for sharing
      try {
        // Use Web Crypto API (available in Node.js 15+) to generate keys in JWK format
        // @ts-ignore - webcrypto may not be in types for older Node versions
        const webCrypto = globalThis.crypto || (crypto as any).webcrypto;
        
        if (!webCrypto || !webCrypto.subtle) {
          throw new Error('Web Crypto API not available. Please use Node.js 15.0.0 or later.');
        }

        // Generate RSA-OAEP key pair (2048 bits)
        const keyPair = await webCrypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256',
          },
          true, // extractable
          ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );

        // Export public key to JWK format
        const publicKeyJwk = await webCrypto.subtle.exportKey('jwk', keyPair.publicKey);

        // Save public key to database
        await saveUserPublicKey(
          result.insertedId.toString(),
          JSON.stringify(publicKeyJwk),
          'RSA-OAEP'
        );

        logger.info(`Sharing keys generated and saved for new user: ${email}`);
      } catch (keyError: any) {
        // Log error but don't fail user creation - keys can be generated later
        logger.error(`Failed to generate sharing keys for new user ${email}: ${keyError.message}`);
      }
    } else {
      // User exists - update their information in case it changed on Google
      logger.info(`Existing user logged in: ${email}`);
      
      await db.updateOne(
        collection.vaultUsers,
        { googleId },
        { 
          $set: { 
            name,
            email,
            picture,
            updatedAt: new Date(),
          }
        }
      );

      // Update local user object with latest info
      user.name = name;
      user.email = email;
      user.picture = picture;
      user.updatedAt = new Date();
    }

    // Step 5: Generate our own JWT token for session management
    // This token is what the frontend will use for authenticated requests
    // It's separate from Google's credential and is issued by our backend
    const { token, tokenId } = generateToken(user);

    // Step 5.1: Create session record
    try {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = getClientIP(req);
      const browser = parseBrowser(userAgent);
      const os = parseOS(userAgent);

      // Generate a refresh token (for future use)
      const refreshToken = crypto.randomBytes(32).toString('hex');

      // Before creating new session, revoke any existing sessions from the same device
      // This prevents duplicate sessions when user logs out and logs back in
      try {
        // Get device type from user agent
        const deviceType = detectDevice(userAgent);
        const deviceName = `${browser} on ${os}`;
        
        // Find and revoke sessions from the same device (same OS and browser)
        const db = new Database('vault');
        const existingSessions = await db.findMany(collection.sessions, {
          userId: new ObjectId(user._id || user.googleId),
          revoked: false,
          deviceName: deviceName,
          deviceType: deviceType,
        }) as any[];
        
        // Revoke matching sessions
        if (existingSessions && existingSessions.length > 0) {
          await db.updateMany(
            collection.sessions,
            {
              userId: new ObjectId(user._id || user.googleId),
              deviceName: deviceName,
              deviceType: deviceType,
              revoked: false,
            },
            {
              $set: {
                revoked: true,
                revokedAt: new Date(),
              },
            }
          );
          logger.info(`Revoked ${existingSessions.length} existing session(s) from same device for user: ${user.email}`);
        }
      } catch (revokeError: any) {
        // Log error but don't fail login if session cleanup fails
        logger.warn(`Failed to revoke existing sessions on login: ${revokeError.message}`);
      }

      await createSession({
        userId: user._id || user.googleId,
        tokenId,
        refreshToken,
        deviceInfo: {
          os,
          browser,
          ipAddress,
          userAgent,
        },
      });

      logger.info(`Session created for user: ${user.email}, tokenId: ${tokenId}`);
    } catch (sessionError: any) {
      // Log error but don't fail login if session creation fails
      logger.error(`Failed to create session: ${sessionError.message}`);
    }

    // Step 6: Return the token and user information to the frontend
    res.status(200).json({
      message: 'Authentication successful',
      token,
      user: {
        id: user._id?.toString() || user.googleId,
        googleId: user.googleId,
        name: user.name,
        email: user.email,
        picture: user.picture,
        createdAt: user.createdAt,
      },
      isFirstTime,
      requires2FA: user.totpEnabled || false,
    });

  } catch (error: any) {
    logger.error(`Google authentication error: ${error.message}`);
    
    // Handle specific Google verification errors
    if (error.message?.includes('Token used too late') || 
        error.message?.includes('Token used too early')) {
      res.status(401).json({ 
        message: 'Authentication failed',
        error: 'Token has expired or is not yet valid'
      });
      return;
    }

    if (error.message?.includes('Invalid token signature')) {
      res.status(401).json({ 
        message: 'Authentication failed',
        error: 'Invalid Google token'
      });
      return;
    }

    // Generic error response
    res.status(500).json({ 
      message: 'Authentication failed',
      error: error.message || 'An unexpected error occurred'
    });
  }
};

/**
 * Get Current User Controller
 * 
 * This protected endpoint returns the currently authenticated user's information.
 * It's used by the frontend to verify the session is still valid and to get user details.
 * 
 * USAGE:
 * - Frontend includes JWT token in Authorization header
 * - authMiddleware extracts and verifies the token
 * - This controller returns the user information
 * 
 * @route GET /auth/me
 * @access Protected (requires valid JWT)
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // req.user is set by authMiddleware after verifying the JWT token
    if (!req.user) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'User information not found in request'
      });
      return;
    }

    // Optionally, fetch fresh user data from database
    // This ensures the data is up-to-date (e.g., if admin changed user's name)
    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, { 
      _id: new ObjectId(req.user.id)
    }) as IUser | null;

    if (!user) {
      // User was deleted but still has a valid token
      res.status(404).json({ 
        message: 'User not found',
        error: 'User account no longer exists'
      });
      return;
    }

    // Return current user information
    res.status(200).json({
      user: {
        id: user._id?.toString() || user.googleId,
        googleId: user.googleId,
        name: user.name,
        email: user.email,
        picture: user.picture,
        createdAt: user.createdAt,
      }
    });

  } catch (error: any) {
    logger.error(`Get current user error: ${error.message}`);
    res.status(500).json({ 
      message: 'Failed to fetch user information',
      error: error.message
    });
  }
};

/**
 * Logout Controller
 * 
 * This endpoint handles user logout.
 * Since JWTs are stateless, logout is primarily handled client-side by
 * removing the token from storage. This endpoint is optional and can be used for:
 * - Logging the logout event
 * - Invalidating tokens (requires token blacklist implementation)
 * - Clearing any server-side sessions
 * 
 * NOTES:
 * - JWT tokens remain valid until expiration
 * - For true invalidation, implement a token blacklist (Redis recommended)
 * - Frontend should remove token from storage immediately
 * 
 * @route POST /auth/logout
 * @access Protected (requires valid JWT)
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenId = (req as any).tokenId; // Get tokenId from auth middleware
    
    // Revoke the current session
    if (req.user && tokenId) {
      try {
        // Get session by tokenId to get the session ID
        const session = await getSessionByTokenId(tokenId);
        
        if (session && session._id) {
          await revokeSession(session._id.toString(), req.user.id);
          logger.info(`Session revoked on logout: ${tokenId} for user: ${req.user.email}`);
        }
      } catch (sessionError: any) {
        // Log error but don't fail logout if session revocation fails
        logger.warn(`Failed to revoke session on logout: ${sessionError.message}`);
      }
      
      logger.info(`User logged out: ${req.user.email}`);
    }

    res.status(200).json({
      message: 'Logout successful',
      note: 'Session has been revoked'
    });

  } catch (error: any) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({ 
      message: 'Logout failed',
      error: error.message
    });
  }
};

