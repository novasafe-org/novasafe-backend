/**
 * TOTP (2FA) Controller
 * 
 * Handles Two-Factor Authentication setup, verification, and management
 * 
 * Endpoints:
 * - POST /auth/2fa/setup - Generate TOTP secret and QR code
 * - POST /auth/2fa/enable - Enable 2FA after verification
 * - POST /auth/2fa/verify - Verify TOTP token during login
 * - POST /auth/2fa/disable - Disable 2FA
 * - GET /auth/2fa/status - Get 2FA status
 * - POST /auth/2fa/backup-codes - Regenerate backup codes
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { DBCONFIG } from '../../config/config';
import Database from '../../database/connection';
import { IUser } from '../models/User';
import {
  generateTOTPSecret,
  verifyTOTP,
  hashBackupCodes,
  verifyBackupCode,
  markBackupCodeAsUsed,
} from '../services/totpService';
import { encryptServerSecret, decryptServerSecret } from '../services/encryptionService';
import logger from '../logger';
import QRCode from 'qrcode';

const collection = DBCONFIG.vault.collections;

/**
 * Setup 2FA - Generate TOTP secret and QR code
 * @route POST /auth/2fa/setup
 * @access Protected
 */
export const setup2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    // Check if 2FA is already enabled
    if (user.totpEnabled) {
      res.status(400).json({
        message: '2FA already enabled',
        error: 'Two-factor authentication is already enabled for this account',
      });
      return;
    }

    // Generate TOTP secret
    const { secret, otpauthUrl, backupCodes } = generateTOTPSecret(user.email);

    // Encrypt the secret before storing
    const { ciphertext, iv } = encryptServerSecret(secret);

    // Hash backup codes
    const hashedBackupCodes = await hashBackupCodes(backupCodes);

    // Store temporary secret (not yet enabled) - user must verify first
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(req.user.id) },
      {
        $set: {
          totpSecret: ciphertext,
          // Store IV separately or combine with ciphertext
          // For simplicity, we'll store as JSON string
          totpSecretIV: iv,
          totpBackupCodes: hashedBackupCodes,
          totpBackupCodesUsed: [],
          updatedAt: new Date(),
        },
      }
    );

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Return secret, QR code, and backup codes (show only once)
    res.status(200).json({
      message: '2FA setup initiated',
      secret, // Only for manual entry if QR code fails
      qrCode: qrCodeDataUrl,
      backupCodes, // Show these once - user must save them
      otpauthUrl, // For manual entry in authenticator apps
    });

    logger.info(`2FA setup initiated for user: ${user.email}`);
  } catch (error: any) {
    logger.error(`2FA setup error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to setup 2FA',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Enable 2FA - Verify token and enable 2FA
 * @route POST /auth/2fa/enable
 * @access Protected
 */
export const enable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.length !== 6) {
      res.status(400).json({
        message: 'Invalid token',
        error: 'Please provide a valid 6-digit TOTP token',
      });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    if (!user.totpSecret) {
      res.status(400).json({
        message: '2FA not set up',
        error: 'Please set up 2FA first using /auth/2fa/setup',
      });
      return;
    }

    if (user.totpEnabled) {
      res.status(400).json({
        message: '2FA already enabled',
        error: 'Two-factor authentication is already enabled',
      });
      return;
    }

    // Decrypt the secret
    const secret = decryptServerSecret(user.totpSecret, user.totpSecretIV || '');

    // Verify the token
    const isValid = verifyTOTP(token, secret);

    if (!isValid) {
      res.status(401).json({
        message: 'Invalid token',
        error: 'The verification code is incorrect. Please try again.',
      });
      return;
    }

    // Enable 2FA
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(req.user.id) },
      {
        $set: {
          totpEnabled: true,
          totpEnabledAt: new Date(),
          totpLastVerified: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      message: '2FA enabled successfully',
      enabled: true,
    });

    logger.info(`2FA enabled for user: ${user.email}`);
  } catch (error: any) {
    logger.error(`2FA enable error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to enable 2FA',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Verify TOTP token during login
 * @route POST /auth/2fa/verify
 * @access Public (but requires valid JWT)
 */
export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const { token, backupCode } = req.body;

    if (!token && !backupCode) {
      res.status(400).json({
        message: 'Token required',
        error: 'Please provide a TOTP token or backup code',
      });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    if (!user.totpEnabled) {
      res.status(400).json({
        message: '2FA not enabled',
        error: 'Two-factor authentication is not enabled for this account',
      });
      return;
    }

    let isValid = false;

    // Verify TOTP token
    if (token) {
      if (typeof token !== 'string' || token.length !== 6) {
        res.status(400).json({
          message: 'Invalid token',
          error: 'TOTP token must be 6 digits',
        });
        return;
      }

      if (!user.totpSecret) {
        res.status(500).json({
          message: '2FA configuration error',
          error: 'TOTP secret not found',
        });
        return;
      }

      // Decrypt the secret
      const secret = decryptServerSecret(user.totpSecret, user.totpSecretIV || '');

      // Verify the token
      isValid = verifyTOTP(token, secret);

      if (isValid) {
        // Update last verified timestamp
        await db.updateOne(
          collection.vaultUsers,
          { _id: new ObjectId(req.user.id) },
          {
            $set: {
              totpLastVerified: new Date(),
              updatedAt: new Date(),
            },
          }
        );
      }
    }

    // Verify backup code if TOTP failed or backup code provided
    if (!isValid && backupCode) {
      if (!user.totpBackupCodes || user.totpBackupCodes.length === 0) {
        res.status(400).json({
          message: 'No backup codes available',
          error: 'Backup codes are not configured',
        });
        return;
      }

      isValid = await verifyBackupCode(
        backupCode,
        user.totpBackupCodes,
        user.totpBackupCodesUsed || []
      );

      if (isValid) {
        // Mark backup code as used
        const usedCodeHash = await markBackupCodeAsUsed(backupCode, user.totpBackupCodes);
        
        if (usedCodeHash) {
          await db.updateOne(
            collection.vaultUsers,
            { _id: new ObjectId(req.user.id) },
            {
              $push: { totpBackupCodesUsed: usedCodeHash },
              $set: {
                totpLastVerified: new Date(),
                updatedAt: new Date(),
              },
            }
          );
        }
      }
    }

    if (!isValid) {
      res.status(401).json({
        message: 'Verification failed',
        error: 'Invalid verification code or backup code',
      });
      return;
    }

    res.status(200).json({
      message: '2FA verification successful',
      verified: true,
    });

    logger.info(`2FA verified for user: ${user.email}`);
  } catch (error: any) {
    logger.error(`2FA verification error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to verify 2FA',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Disable 2FA
 * @route POST /auth/2fa/disable
 * @access Protected
 */
export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const { token, password } = req.body;

    // Require either TOTP token or password for security
    if (!token && !password) {
      res.status(400).json({
        message: 'Verification required',
        error: 'Please provide a TOTP token or password to disable 2FA',
      });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    if (!user.totpEnabled) {
      res.status(400).json({
        message: '2FA not enabled',
        error: 'Two-factor authentication is not enabled for this account',
      });
      return;
    }

    // Verify TOTP token if provided
    if (token) {
      if (!user.totpSecret) {
        res.status(500).json({
          message: '2FA configuration error',
          error: 'TOTP secret not found',
        });
        return;
      }

      const secret = decryptServerSecret(user.totpSecret, user.totpSecretIV || '');
      const isValid = verifyTOTP(token, secret);

      if (!isValid) {
        res.status(401).json({
          message: 'Invalid token',
          error: 'The verification code is incorrect',
        });
        return;
      }
    }

    // TODO: Verify password if provided (when password auth is implemented)

    // Disable 2FA and clear secrets
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(req.user.id) },
      {
        $set: {
          totpEnabled: false,
          totpSecret: null,
          totpSecretIV: null,
          totpBackupCodes: null,
          totpBackupCodesUsed: null,
          totpEnabledAt: null,
          totpLastVerified: null,
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      message: '2FA disabled successfully',
      enabled: false,
    });

    logger.info(`2FA disabled for user: ${user.email}`);
  } catch (error: any) {
    logger.error(`2FA disable error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to disable 2FA',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Get 2FA status
 * @route GET /auth/2fa/status
 * @access Protected
 */
export const get2FAStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    res.status(200).json({
      enabled: user.totpEnabled || false,
      enabledAt: user.totpEnabledAt || null,
      lastVerified: user.totpLastVerified || null,
      backupCodesCount: user.totpBackupCodes?.length || 0,
      backupCodesUsedCount: user.totpBackupCodesUsed?.length || 0,
    });
  } catch (error: any) {
    logger.error(`Get 2FA status error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to get 2FA status',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Regenerate backup codes
 * @route POST /auth/2fa/backup-codes
 * @access Protected
 */
export const regenerateBackupCodes = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const db = new Database('vault');
    const user = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(req.user.id),
    }) as IUser | null;

    if (!user) {
      res.status(404).json({ message: 'User not found', error: 'User does not exist' });
      return;
    }

    if (!user.totpEnabled) {
      res.status(400).json({
        message: '2FA not enabled',
        error: 'Two-factor authentication is not enabled',
      });
      return;
    }

    // Generate new backup codes
    const backupCodes = Array.from({ length: 8 }, () => {
      return Math.random().toString(36).substring(2, 12).toUpperCase();
    });

    // Hash backup codes
    const hashedBackupCodes = await hashBackupCodes(backupCodes);

    // Update backup codes (reset used codes)
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(req.user.id) },
      {
        $set: {
          totpBackupCodes: hashedBackupCodes,
          totpBackupCodesUsed: [],
          updatedAt: new Date(),
        },
      }
    );

    // Return plain codes (show only once)
    res.status(200).json({
      message: 'Backup codes regenerated',
      backupCodes, // Show these once - user must save them
    });

    logger.info(`Backup codes regenerated for user: ${user.email}`);
  } catch (error: any) {
    logger.error(`Regenerate backup codes error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to regenerate backup codes',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

