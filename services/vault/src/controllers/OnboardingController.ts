/**
 * Onboarding Controller
 * 
 * Handles all onboarding-related endpoints:
 * - Check email existence
 * - Send OTP
 * - Verify OTP
 * - Create account
 * - Generate recovery key
 * - Complete onboarding
 */

import { Request, Response } from 'express';
import {
  checkEmailExists,
  createOTP,
  verifyOTPCode,
  createAccount,
  generateRecoverySecrets,
  saveRecoveryKey,
  completeOnboarding,
} from '../services/onboardingService';
import logger from '../logger';
import { generateToken } from '../utils/generateToken';
import { createSession } from '../services/sessionService';
import { getClientIP, parseBrowser, parseOS } from '../utils/deviceDetection';
import { saveUserPublicKey } from '../services/shareService';
import { sendOTPEmail } from '../services/emailService';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ObjectId } from 'mongodb';
import { IUser } from '../models/User';

// Initialize Google OAuth2 client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Extract Google ID and picture from credential
 */
const extractGoogleInfo = async (credential: string): Promise<{ googleId?: string; picture?: string }> => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      logger.error('GOOGLE_CLIENT_ID not configured');
      return {};
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return {};
    }

    return {
      googleId: payload.sub,
      picture: payload.picture,
    };
  } catch (error: any) {
    logger.error(`Failed to extract Google info: ${error.message}`);
    return {};
  }
};

/**
 * Check if email exists
 * @route POST /v/onboarding/check-email
 * @access Public
 */
export const checkEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
        error: 'Email is required',
        userMessage: 'Email address is required.',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid email address (e.g., yourname@example.com).',
        error: 'Invalid email format',
        userMessage: 'Please enter a valid email address.',
      });
      return;
    }

    const exists = await checkEmailExists(email);

    logger.info(`Email check: ${email}, exists: ${exists}`);

    res.status(200).json({
      exists,
      message: exists ? 'Email already registered' : 'Email is available',
    });
  } catch (error: any) {
    logger.error(`Check email error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'We encountered an issue checking your email. Please try again.',
      error: error.message,
      userMessage: 'Something went wrong. Please try again.',
    });
  }
};

/**
 * Send OTP to email
 * @route POST /v/onboarding/send-otp
 * @access Public
 */
export const sendOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
        error: 'Email is required',
        userMessage: 'Email address is required.',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid email address (e.g., yourname@example.com).',
        error: 'Invalid email format',
        userMessage: 'Please enter a valid email address.',
      });
      return;
    }

    // Check if email already exists and user onboarding status
    // Note: For invited users, we allow OTP even if email exists (they're accepting invitation)
    // Also allow OTP if user exists but onboarding is not completed (user is still in onboarding flow)
    // This prevents errors when user creates account but hasn't completed onboarding yet
    const isInvitationFlow = req.query.invitation === 'true';
    let isOnboardingInProgress = false;
    
    try {
      const db = new Database('vault');
      const user = await db.findOne(DBCONFIG.vault.collections.vaultUsers, {
        email: email.toLowerCase().trim(),
      }) as IUser | null;
      
      if (user) {
        // Allow OTP if onboarding is not completed (user is still in onboarding flow)
        // This handles the case where account was created but user is still completing onboarding steps
        if (user.onboardingCompleted === false) {
          isOnboardingInProgress = true;
          logger.info(`Allowing OTP for user in onboarding: ${email}`);
        }
        
        // Only reject if email exists, not an invitation, and onboarding is completed
        if (!isInvitationFlow && !isOnboardingInProgress) {
          res.status(409).json({
            success: false,
            message: 'An account with this email already exists. Please log in instead.',
            error: 'Email already registered',
            userMessage: 'This email is already registered. Would you like to log in?',
          });
          return;
        }
      }
    } catch (error: any) {
      logger.error(`Error checking email and onboarding status: ${error.message}`);
      // If we can't check, proceed with normal flow (allow OTP generation)
    }

    // Generate and store OTP
    const otp = await createOTP(email, 'email_verification');

    // Send OTP via email service
    try {
      const emailSent = await sendOTPEmail(email, otp);
      if (!emailSent) {
        // TODO: Remove this log after development
        logger.debug({ email, otp }, 'OTP generated and email sent'); // Temporary log OTP for development purposes, remove after development
        // TODO: Remove this log after development
        logger.warn({ email }, 'Failed to send OTP email, but OTP was generated');
        // Still return success - OTP is generated and can be verified
        // In development, include OTP in response
        res.status(200).json({
          success: true,
          message: 'OTP generated successfully',
          // In development, include OTP for testing
          otp: process.env.NODE_ENV === 'development' ? otp : undefined,
          expiresIn: 600, // 10 minutes in seconds
          emailSent: false,
        });
        return;
      }
    } catch (error: any) {
      logger.error({ error: error.message, email }, 'Error sending OTP email');
      // Still return success - OTP is generated
      res.status(200).json({
        success: true,
        message: 'OTP generated successfully',
        // In development, include OTP for testing
        otp: process.env.NODE_ENV === 'development' ? otp : undefined,
        expiresIn: 600,
        emailSent: false,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your email',
      // In development, include OTP for testing
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
      expiresIn: 600, // 10 minutes in seconds
    });
  } catch (error: any) {
    logger.error(`Send OTP error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'We couldn\'t send the verification code. Please try again in a moment.',
      error: error.message,
      userMessage: 'Failed to send verification code. Please try again.',
    });
  }
};

/**
 * Verify OTP
 * @route POST /v/onboarding/verify-otp
 * @access Public
 */
export const verifyOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide your email address.',
        error: 'Email is required',
        userMessage: 'Email address is required.',
      });
      return;
    }

    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      res.status(400).json({
        success: false,
        message: 'Please enter the 6-digit verification code sent to your email.',
        error: 'Valid 6-digit OTP is required',
        userMessage: 'Please enter a valid 6-digit verification code.',
      });
      return;
    }

    const isValid = await verifyOTPCode(email, otp, 'email_verification');

    if (!isValid) {
      res.status(401).json({
        success: false,
        message: 'The verification code you entered is incorrect or has expired. Please try again.',
        error: 'Invalid or expired OTP',
        userMessage: 'Invalid or expired verification code. Please request a new one.',
      });
      return;
    }

    logger.info(`OTP verified successfully for: ${email}`);

    res.status(200).json({
      message: 'OTP verified successfully',
      verified: true,
    });
  } catch (error: any) {
    logger.error(`Verify OTP error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'We encountered an issue verifying your code. Please try again.',
      error: error.message,
      userMessage: 'Verification failed. Please try again.',
    });
  }
};

/**
 * Create account
 * @route POST /v/onboarding/create-account
 * @access Public
 */
export const createAccountEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      fullName,
      password,
      signupMethod,
      planId,
      companyName,
      phoneNumber,
      companyDomain,
      googleCredential,
    } = req.body;

    // Validate required fields
    if (!email || !fullName) {
      res.status(400).json({
        success: false,
        message: 'Please provide your email address and full name.',
        error: 'Email and full name are required',
        userMessage: 'Email and full name are required.',
      });
      return;
    }

    if (signupMethod === 'email' && !password) {
      res.status(400).json({
        success: false,
        message: 'Please create a password for your account.',
        error: 'Password is required for email signup',
        userMessage: 'Password is required.',
      });
      return;
    }

    if (!planId) {
      res.status(400).json({
        success: false,
        message: 'Please select a plan to continue.',
        error: 'Plan ID is required',
        userMessage: 'Please select a plan.',
      });
      return;
    }

    // Validate plan ID
    const validPlanIds = ['individual', 'family', 'team', 'business'];
    if (!validPlanIds.includes(planId)) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'Invalid plan ID',
      });
      return;
    }

    // For email signup, verify OTP was verified
    if (signupMethod === 'email') {
      // Check if email is verified (OTP was verified)
      // This should be checked via a separate verification status endpoint
      // For now, we'll trust the frontend, but in production, maintain a verified state
    }

    // Create account
    const { userId, user } = await createAccount({
      email,
      name: fullName,
      password: password || '', // Empty for Google signup
      signupMethod: signupMethod || 'email',
      planId,
      companyName,
      phoneNumber,
      companyDomain,
      ...(googleCredential ? await extractGoogleInfo(googleCredential) : {}),
    });

    // Generate RSA key pair for sharing (same as Google login)
    try {
      const webCrypto = globalThis.crypto || (crypto as any).webcrypto;
      
      if (webCrypto && webCrypto.subtle) {
        const keyPair = await webCrypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );

        const publicKeyJwk = await webCrypto.subtle.exportKey('jwk', keyPair.publicKey);
        await saveUserPublicKey(userId, JSON.stringify(publicKeyJwk), 'RSA-OAEP');

        logger.info(`Sharing keys generated for new user: ${email}`);
      }
    } catch (keyError: any) {
      logger.error(`Failed to generate sharing keys: ${keyError.message}`);
      // Don't fail account creation if key generation fails
    }

    logger.info(`Account created successfully: ${email}, userId: ${userId}`);

    // Generate redirect URL based on user's plan and company
    const { getRedirectUrl } = await import('../utils/redirectUrl');
    const redirectUrl = getRedirectUrl(user.planId || 'individual', user.companyName);

    res.status(201).json({
      message: 'Account created successfully',
      success: true,
      userId,
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        planId: user.planId,
        companyName: user.companyName,
      },
      redirectUrl,
    });
  } catch (error: any) {
    logger.error(`Create account error: ${error.message}`);
    
    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please log in instead.',
        error: 'Account already exists',
        userMessage: 'This email is already registered. Would you like to log in?',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'We encountered an issue creating your account. Please try again in a moment.',
      error: error.message,
      userMessage: 'Something went wrong. Please try again.',
    });
  }
};

/**
 * Generate recovery key
 * @route POST /v/onboarding/generate-recovery-key
 * @access Public (should be protected in production)
 */
export const generateRecoveryKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User information is missing. Please start the onboarding process again.',
        error: 'User ID is required',
        userMessage: 'Please complete the previous steps first.',
      });
      return;
    }

    // Generate recovery secrets
    const secrets = generateRecoverySecrets();

    // Save recovery key hash (don't store plain key)
    await saveRecoveryKey(userId, secrets.recoveryKey);

    logger.info(`Recovery key generated for userId: ${userId}`);

    res.status(200).json({
      message: 'Recovery key generated successfully',
      recoveryKey: secrets.recoveryKey,
      masterPassword: secrets.masterPassword,
      encryptedData: secrets.encryptedData,
      // Note: In production, these should be sent via secure channel, not in response
    });
  } catch (error: any) {
    logger.error(`Generate recovery key error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'We couldn\'t generate your recovery key. Please try again.',
      error: error.message,
      userMessage: 'Failed to generate recovery key. Please try again.',
    });
  }
};

/**
 * Complete onboarding
 * @route POST /v/onboarding/complete
 * @access Public (should be protected in production)
 */
export const completeOnboardingEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User information is missing. Please start the onboarding process again.',
        error: 'User ID is required',
        userMessage: 'Please complete the previous steps first.',
      });
      return;
    }

    await completeOnboarding(userId);

    // Generate JWT token for the user
    const db = new Database('vault');
    const user = await db.findOne(DBCONFIG.vault.collections.vaultUsers, {
      _id: new ObjectId(userId),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Your account could not be found. Please start the onboarding process again.',
        error: 'User account not found',
        userMessage: 'Account not found. Please try again.',
      });
      return;
    }

    const { token, tokenId } = generateToken(user);

    // Create session
    try {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = getClientIP(req);
      const browser = parseBrowser(userAgent);
      const os = parseOS(userAgent);
      const refreshToken = crypto.randomBytes(32).toString('hex');

      await createSession({
        userId: userId,
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
      // Don't fail onboarding completion if session creation fails
    }

    logger.info(`Onboarding completed for userId: ${userId}`);

    // Generate redirect URL based on user's plan and company
    const { getRedirectUrl } = await import('../utils/redirectUrl');
    const redirectUrl = getRedirectUrl(user.planId || 'individual', user.companyName);

    res.status(200).json({
      message: 'Onboarding completed successfully',
      token,
      user: {
        id: user._id?.toString() || userId,
        email: user.email,
        name: user.name,
        planId: user.planId,
        companyName: user.companyName,
      },
      redirectUrl,
    });
  } catch (error: any) {
    logger.error(`Complete onboarding error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'We encountered an issue completing your setup. Please try again.',
      error: error.message,
      userMessage: 'Failed to complete setup. Please try again.',
    });
  }
};

