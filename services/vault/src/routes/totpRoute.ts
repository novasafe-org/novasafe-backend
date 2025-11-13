/**
 * TOTP (2FA) Routes
 * 
 * Handles Two-Factor Authentication endpoints
 * 
 * BASE PATH: /v/auth/2fa
 */

import express from 'express';
import {
  setup2FA,
  enable2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from '../controllers/TOTPController';
import { authMiddleware } from '../middlewares/auth';

const router = express.Router();

/**
 * @route   POST /v/auth/2fa/setup
 * @desc    Generate TOTP secret and QR code for 2FA setup
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "message": "2FA setup initiated",
 *   "secret": "JBSWY3DPEHPK3PXP",
 *   "qrCode": "data:image/png;base64,...",
 *   "backupCodes": ["ABC123", "DEF456", ...],
 *   "otpauthUrl": "otpauth://totp/..."
 * }
 */
router.post('/setup', authMiddleware, setup2FA);

/**
 * @route   POST /v/auth/2fa/enable
 * @desc    Enable 2FA after verifying TOTP token
 * @access  Protected (requires JWT token)
 * 
 * REQUEST BODY:
 * {
 *   "token": "123456"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "2FA enabled successfully",
 *   "enabled": true
 * }
 */
router.post('/enable', authMiddleware, enable2FA);

/**
 * @route   POST /v/auth/2fa/verify
 * @desc    Verify TOTP token during login
 * @access  Protected (requires JWT token)
 * 
 * REQUEST BODY:
 * {
 *   "token": "123456"  // OR
 *   "backupCode": "ABC123"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "2FA verification successful",
 *   "verified": true
 * }
 */
router.post('/verify', authMiddleware, verify2FA);

/**
 * @route   POST /v/auth/2fa/disable
 * @desc    Disable 2FA (requires TOTP token or password)
 * @access  Protected (requires JWT token)
 * 
 * REQUEST BODY:
 * {
 *   "token": "123456"  // OR
 *   "password": "userpassword"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "2FA disabled successfully",
 *   "enabled": false
 * }
 */
router.post('/disable', authMiddleware, disable2FA);

/**
 * @route   GET /v/auth/2fa/status
 * @desc    Get 2FA status for current user
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "enabled": true,
 *   "enabledAt": "2024-01-15T10:30:00.000Z",
 *   "lastVerified": "2024-01-15T10:30:00.000Z",
 *   "backupCodesCount": 8,
 *   "backupCodesUsedCount": 0
 * }
 */
router.get('/status', authMiddleware, get2FAStatus);

/**
 * @route   POST /v/auth/2fa/backup-codes
 * @desc    Regenerate backup codes
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "message": "Backup codes regenerated",
 *   "backupCodes": ["ABC123", "DEF456", ...]
 * }
 */
router.post('/backup-codes', authMiddleware, regenerateBackupCodes);

export default router;

