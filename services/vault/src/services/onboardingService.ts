/**
 * Onboarding Service
 * 
 * Handles all onboarding-related operations:
 * - Email existence checking
 * - OTP generation and verification
 * - Account creation
 * - Recovery key generation
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IUser } from '../models/User';
import { IOTP } from '../models/OTP';
import logger from '../logger';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const collection = DBCONFIG.vault.collections;

/**
 * Check if email already exists in database
 */
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, { 
      email: email.toLowerCase().trim() 
    });
    
    return !!user;
  } catch (error: any) {
    logger.error(`Error checking email existence: ${error.message}`);
    throw error;
  }
};

/**
 * Generate a 6-digit OTP
 */
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash OTP before storage
 */
export const hashOTP = (otp: string): string => {
  return bcrypt.hashSync(otp, 10);
};

/**
 * Verify OTP
 */
export const verifyOTP = async (otp: string, otpHash: string): Promise<boolean> => {
  return bcrypt.compareSync(otp, otpHash);
};

/**
 * Create and store OTP for email verification
 */
export const createOTP = async (
  email: string,
  purpose: 'email_verification' | 'password_reset' = 'email_verification'
): Promise<string> => {
  try {
    const db = new Database('vault');
    
    // Generate 6-digit OTP
    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    
    // Set expiration (10 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    
    // Invalidate any existing OTPs for this email and purpose
    await db.updateMany(
      collection.otps || 'otps',
      {
        email: email.toLowerCase().trim(),
        purpose,
        verified: false,
      },
      {
        $set: {
          verified: true, // Mark as used
          verifiedAt: new Date(),
        }
      }
    );
    
    // Create new OTP record
    const otpRecord: Omit<IOTP, '_id'> = {
      email: email.toLowerCase().trim(),
      otpHash,
      createdAt: new Date(),
      expiresAt,
      verified: false,
      attempts: 0,
      purpose,
    };
    
    await db.insertOne(collection.otps || 'otps', otpRecord);
    
    logger.info(`OTP created for email: ${email}, purpose: ${purpose}`);
    
    return otp; // Return plain OTP for sending via email
  } catch (error: any) {
    logger.error(`Error creating OTP: ${error.message}`);
    throw error;
  }
};

/**
 * Verify OTP code
 */
export const verifyOTPCode = async (
  email: string,
  otp: string,
  purpose: 'email_verification' | 'password_reset' = 'email_verification'
): Promise<boolean> => {
  try {
    const db = new Database('vault');
    
    // Find the most recent unverified OTP for this email
    const otpRecords = await db.findMany(collection.otps || 'otps', {
      email: email.toLowerCase().trim(),
      purpose,
      verified: false,
    });
    
    if (!otpRecords || otpRecords.length === 0) {
      logger.warn(`No OTP found for email: ${email}, purpose: ${purpose}`);
      return false;
    }
    
    // Get the most recent OTP
    const otpRecord = otpRecords.sort((a: IOTP, b: IOTP) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0] as IOTP;
    
    // Check if OTP has expired
    if (new Date(otpRecord.expiresAt) < new Date()) {
      logger.warn(`OTP expired for email: ${email}`);
      return false;
    }
    
    // Check if too many attempts
    if (otpRecord.attempts >= 5) {
      logger.warn(`Too many OTP attempts for email: ${email}`);
      return false;
    }
    
    // Increment attempts
    await db.updateOne(
      collection.otps || 'otps',
      { _id: otpRecord._id },
      { $inc: { attempts: 1 } }
    );
    
    // Verify OTP
    const isValid = await verifyOTP(otp, otpRecord.otpHash);
    
    if (isValid) {
      // Mark OTP as verified
      await db.updateOne(
        collection.otps || 'otps',
        { _id: otpRecord._id },
        {
          $set: {
            verified: true,
            verifiedAt: new Date(),
          }
        }
      );
      
      logger.info(`OTP verified successfully for email: ${email}`);
      return true;
    }
    
    logger.warn(`Invalid OTP for email: ${email}`);
    return false;
  } catch (error: any) {
    logger.error(`Error verifying OTP: ${error.message}`);
    throw error;
  }
};

/**
 * Create a new user account
 */
export const createAccount = async (userData: {
  email: string;
  name: string;
  password: string;
  signupMethod: 'google' | 'email';
  planId: string;
  companyName?: string;
  phoneNumber?: string;
  companyDomain?: string;
  googleId?: string;
  picture?: string;
}): Promise<{ userId: string; user: IUser; workspaceId?: string }> => {
  try {
    const db = new Database('vault');
    
    // Check if email already exists
    const existingUser = await db.findOne(collection.vaultUsers, {
      email: userData.email.toLowerCase().trim()
    });
    
    if (existingUser) {
      throw new Error('An account with this email already exists');
    }
    
    // Hash password if email signup
    let passwordHash: string | undefined;
    if (userData.signupMethod === 'email') {
      passwordHash = bcrypt.hashSync(userData.password, 10);
    }
    
    // Determine user role based on plan
    // For Team/Business plans, account creator is admin by default
    // For Individual/Family plans, no role needed (defaults to 'user')
    let userRole: string | undefined;
    const planId = (userData.planId || 'individual').toLowerCase();
    if (planId === 'team' || planId === 'business') {
      userRole = 'admin'; // Account creator is admin
    }

    // Create user object
    const newUser: any = {
      email: userData.email.toLowerCase().trim(),
      name: userData.name,
      signupMethod: userData.signupMethod,
      passwordHash,
      emailVerified: userData.signupMethod === 'google', // Google emails are pre-verified
      emailVerifiedAt: userData.signupMethod === 'google' ? new Date() : null,
      onboardingCompleted: false,
      planId: userData.planId,
      companyName: userData.companyName,
      phoneNumber: userData.phoneNumber,
      companyDomain: userData.companyDomain,
      googleId: userData.googleId,
      picture: userData.picture,
      totpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add role if set
    if (userRole) {
      newUser.role = userRole;
    }
    
    // Insert user into database
    const result = await db.insertOne(collection.vaultUsers, newUser);
    const userId = result.insertedId.toString();
    const user: IUser = {
      ...newUser,
      _id: result.insertedId,
    };

    // Create default workspace and membership (one user identity, workspace owns plan/billing)
    const { createWorkspace } = await import('./workspaceService');
    const { upsertMembership } = await import('./rbacService');
    const { UserRole } = await import('../constants/rbac.constants');
    const workspaceType = (['individual', 'family', 'team', 'business'].includes(planId) ? planId : 'individual') as 'individual' | 'family' | 'team' | 'business';
    const workspaceName = userData.companyName || 'Personal';
    const workspace = await createWorkspace({
      name: workspaceName,
      type: workspaceType,
      ownerUserId: userId,
    });
    await upsertMembership(userId, workspace._id!.toString(), UserRole.OWNER as any, 'active', true);

    logger.info(`New account created: ${userData.email}, userId: ${userId}, workspaceId: ${workspace._id}`);
    return {
      userId,
      user,
      workspaceId: workspace._id!.toString(),
    };
  } catch (error: any) {
    logger.error(`Error creating account: ${error.message}`);
    throw error;
  }
};

/**
 * Generate recovery key and secrets
 */
export const generateRecoverySecrets = (): {
  recoveryKey: string;
  masterPassword: string;
  encryptedData: string;
} => {
  // Generate 32-byte recovery key (base64 encoded)
  const recoveryKey = crypto.randomBytes(32).toString('base64');
  
  // Generate master password (32 bytes, base64 encoded)
  const masterPassword = crypto.randomBytes(32).toString('base64');
  
  // For now, encryptedData is a placeholder
  // In production, this would contain encrypted vault data
  const encryptedData = crypto.randomBytes(64).toString('base64');
  
  return {
    recoveryKey,
    masterPassword,
    encryptedData,
  };
};

/**
 * Hash and store recovery key
 */
export const saveRecoveryKey = async (
  userId: string,
  recoveryKey: string
): Promise<void> => {
  try {
    const db = new Database('vault');
    
    const recoveryKeyHash = bcrypt.hashSync(recoveryKey, 10);
    
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(userId) },
      {
        $set: {
          recoveryKeyHash,
          recoveryKeyCreatedAt: new Date(),
          recoveryKeyUsed: false,
          onboardingCompleted: true,
          updatedAt: new Date(),
        }
      }
    );
    
    logger.info(`Recovery key saved for userId: ${userId}`);
  } catch (error: any) {
    logger.error(`Error saving recovery key: ${error.message}`);
    throw error;
  }
};

/**
 * Complete onboarding process
 * Also creates a 30-day free trial subscription automatically
 */
export const completeOnboarding = async (userId: string): Promise<void> => {
  try {
    const db = new Database('vault');
    
    // Get user to determine plan
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
    }) as any;

    if (!user) {
      throw new Error('User not found');
    }

    // Update user onboarding status
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(userId) },
      {
        $set: {
          onboardingCompleted: true,
          updatedAt: new Date(),
        }
      }
    );

    // Resolve user's default workspace (created at signup or via lazy migration)
    const { getDefaultWorkspaceIdForUser } = await import('./workspaceService');
    const workspaceId = await getDefaultWorkspaceIdForUser(userId);

    // Create 30-day free trial subscription for the workspace
    const { createSubscription, getSubscriptionByWorkspaceId } = await import('./subscriptionService');
    const planId = (user.planId || 'individual') as any;
    const trialDays = 30;
    const existingSubscription = await getSubscriptionByWorkspaceId(workspaceId);
    if (!existingSubscription) {
      await createSubscription({
        userId,
        workspaceId,
        planId,
        billingPeriod: 'monthly',
        trialDays,
        provider: 'razorpay',
        paymentMethodAdded: false,
      });
      logger.info(`30-day free trial subscription created for workspaceId: ${workspaceId}, plan: ${planId}`);
    }

    // Create default "Personal" folder in the workspace
    try {
      const existingPersonalFolder = await db.findOne(collection.folders, {
        $or: [{ workspaceId }, { userId: new ObjectId(userId) }],
        name: 'Personal',
      });
      if (!existingPersonalFolder) {
        const personalFolder: any = {
          userId: new ObjectId(userId),
          workspaceId,
          name: 'Personal',
          description: 'Default safe for your personal items',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 0,
        };
        const folderResult = await db.insertOne(collection.folders, personalFolder);
        logger.info(`Personal folder created for workspaceId: ${workspaceId}, folderId: ${folderResult.insertedId}`);
      }
    } catch (folderError: any) {
      logger.warn(`Failed to create Personal folder during onboarding: ${folderError.message}`);
    }
    
    logger.info(`Onboarding completed for userId: ${userId}`);
  } catch (error: any) {
    logger.error(`Error completing onboarding: ${error.message}`);
    throw error;
  }
};

