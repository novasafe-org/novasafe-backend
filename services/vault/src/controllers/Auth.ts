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
import { logActivity } from '../utils/activityLogHelper';
import logger from '../logger';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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

    // Step 4: Handle existing vs new users
    // For new users, they should go through onboarding flow
    // Google login should only work for existing users
    const isFirstTime = !user;
    
    if (!user) {
      // Check if user exists by email (might have signed up with email)
      user = await db.findOne(collection.vaultUsers, { 
        email: email.toLowerCase().trim() 
      }) as IUser | null;

      if (user) {
        // User exists with email signup, update with Google ID
        logger.info(`Linking Google account to existing email user: ${email}`);
        await db.updateOne(
          collection.vaultUsers,
          { _id: user._id },
          {
            $set: {
              googleId,
              picture,
              updatedAt: new Date(),
            }
          }
        );
        user.googleId = googleId;
        user.picture = picture;
      } else {
        // New user - they should go through onboarding
        // Return error indicating they need to sign up first
        res.status(404).json({
          success: false,
          message: 'No account found with this Google account. Please sign up first.',
          error: 'Account not found',
          userMessage: 'No account found with this email. Please sign up first.',
          requiresSignup: true,
        });
        return;
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

    // Log successful login (non-blocking)
    logActivity(req, user, {
      action: 'USER_LOGIN_SUCCESS',
      targetType: 'user',
      targetId: user._id?.toString() || user.googleId || null,
      description: `User logged in successfully via Google`,
      metadata: {
        signupMethod: 'google',
        hasPicture: !!user.picture,
      },
    }).catch((err) => {
      logger.warn(`Failed to log activity: ${err.message}`);
    });

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

      // Fetch user for activity logging
      const db = new Database('vault');
      const user = await db.findOne(collection.vaultUsers, {
        _id: new ObjectId(req.user.id),
      }) as IUser | null;

      if (user) {
        // Log logout (non-blocking)
        logActivity(req, user, {
          action: 'USER_LOGOUT',
          targetType: 'session',
          targetId: tokenId || null,
          description: `User logged out`,
          metadata: {
            tokenId: tokenId || null,
          },
        }).catch((err) => {
          logger.warn(`Failed to log activity: ${err.message}`);
        });
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

/**
 * Email/Password Login Controller
 * 
 * This endpoint handles email and password authentication.
 * It verifies the password, checks account status, and issues a JWT session token.
 * 
 * FLOW:
 * 1. Frontend sends email and password
 * 2. Backend verifies password hash
 * 3. Backend checks account lock status
 * 4. Backend issues JWT token for app sessions
 * 5. Frontend stores JWT token and uses it for authenticated requests
 * 
 * SECURITY NOTES:
 * - Passwords are hashed with bcrypt before storage
 * - Account locks after 5 failed login attempts
 * - Failed attempts are tracked and reset on successful login
 * 
 * @route POST /auth/email
 * @access Public
 */
export const emailLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
        error: 'Email and password are required',
        userMessage: 'Email and password are required.',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
        error: 'Invalid email format',
        userMessage: 'Please enter a valid email address.',
      });
      return;
    }

    // Find user by email
    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      email: email.toLowerCase().trim(),
    }) as IUser | null;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        error: 'Invalid email or password',
        userMessage: 'Invalid email or password. Please check your credentials.',
      });
      return;
    }

    // Check if user has password (email signup) or can use password login
    if (!user.passwordHash && user.signupMethod !== 'email') {
      res.status(401).json({
        success: false,
        message: 'This account uses Google sign-in. Please use Google to log in.',
        error: 'This account uses Google sign-in',
        userMessage: 'This account uses Google sign-in. Please use Google to log in.',
      });
      return;
    }

    // Check if account is locked
    if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil).getTime() - new Date().getTime()) / 1000 / 60
      );
      res.status(423).json({
        success: false,
        message: `Your account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`,
        error: 'Account locked',
        userMessage: `Account is locked. Please try again in ${lockTimeRemaining} minutes.`,
        lockTimeRemaining,
      });
      return;
    }

    // Check if password hash exists
    if (!user.passwordHash) {
      res.status(401).json({
        success: false,
        message: 'This account uses Google sign-in. Please use Google to log in.',
        error: 'Password not set for this account',
        userMessage: 'This account uses Google sign-in. Please use Google to log in.',
      });
      return;
    }

    // Verify password
    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const maxAttempts = 5;
      const lockDurationMinutes = 30;

      let updateData: any = {
        failedLoginAttempts: failedAttempts,
        updatedAt: new Date(),
      };

      // Lock account after max attempts
      if (failedAttempts >= maxAttempts) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + lockDurationMinutes);
        updateData.accountLockedUntil = lockUntil;

        logger.warn(`Account locked due to ${failedAttempts} failed login attempts: ${email}`);

        // Log critical security event
        logActivity(req, user, {
          action: failedAttempts >= maxAttempts ? 'MULTIPLE_FAILED_LOGINS' : 'USER_LOGIN_FAILED',
          targetType: 'user',
          targetId: user._id?.toString() || null,
          description: `Failed login attempt ${failedAttempts}/${maxAttempts}. Account locked.`,
          metadata: {
            failedAttempts,
            accountLocked: true,
          },
        }).catch((err) => {
          logger.warn(`Failed to log activity: ${err.message}`);
        });
      } else {
        // Log failed login
        logActivity(req, user, {
          action: 'USER_LOGIN_FAILED',
          targetType: 'user',
          targetId: user._id?.toString() || null,
          description: `Failed login attempt ${failedAttempts}/${maxAttempts}`,
          metadata: {
            failedAttempts,
          },
        }).catch((err) => {
          logger.warn(`Failed to log activity: ${err.message}`);
        });
      }

      await db.updateOne(
        collection.vaultUsers,
        { _id: user._id },
        { $set: updateData }
      );

      res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        error: 'Invalid email or password',
        userMessage: failedAttempts >= maxAttempts 
          ? 'Account locked due to too many failed attempts. Please try again later.'
          : `Invalid email or password. ${maxAttempts - failedAttempts} attempts remaining.`,
        failedAttempts,
        accountLocked: failedAttempts >= maxAttempts,
      });
      return;
    }

    // Password is valid - reset failed attempts and unlock account
    await db.updateOne(
      collection.vaultUsers,
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: 0,
          accountLockedUntil: null,
          updatedAt: new Date(),
        }
      }
    );

    // Update user object
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;

    // Generate JWT token
    const { token, tokenId } = generateToken(user);

    // Create session
    try {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = getClientIP(req);
      const browser = parseBrowser(userAgent);
      const os = parseOS(userAgent);
      const refreshToken = crypto.randomBytes(32).toString('hex');

      // Revoke existing sessions from same device (optional)
      try {
        const deviceType = detectDevice(userAgent);
        const deviceName = `${browser} on ${os}`;
        
        const existingSessions = await db.findMany(collection.sessions, {
          userId: new ObjectId(user._id || user.googleId || ''),
          revoked: false,
          deviceName: deviceName,
          deviceType: deviceType,
        }) as any[];
        
        if (existingSessions && existingSessions.length > 0) {
          await db.updateMany(
            collection.sessions,
            {
              userId: new ObjectId(user._id || user.googleId || ''),
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
        logger.warn(`Failed to revoke existing sessions on login: ${revokeError.message}`);
      }

      await createSession({
        userId: user._id || user.googleId || '',
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
      logger.error(`Failed to create session: ${sessionError.message}`);
      // Don't fail login if session creation fails
    }

    logger.info(`Email login successful: ${email}`);

    // Log successful login (non-blocking)
    logActivity(req, user, {
      action: 'USER_LOGIN_SUCCESS',
      targetType: 'user',
      targetId: user._id?.toString() || null,
      description: `User logged in successfully via email/password`,
      metadata: {
        signupMethod: 'email',
      },
    }).catch((err) => {
      logger.warn(`Failed to log activity: ${err.message}`);
    });

    // Return token and user information
    res.status(200).json({
      message: 'Authentication successful',
      token,
      user: {
        id: user._id?.toString() || user.googleId || '',
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt,
        planId: user.planId,
      },
      requires2FA: user.totpEnabled || false,
    });

  } catch (error: any) {
    logger.error(`Email login error: ${error.message}`);
    res.status(500).json({
      message: 'Authentication failed',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

