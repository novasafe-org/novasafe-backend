/**
 * Onboarding Routes
 * 
 * These routes handle all onboarding-related operations:
 * - Check email existence
 * - Send OTP
 * - Verify OTP
 * - Create account
 * - Generate recovery key
 * - Complete onboarding
 * 
 * BASE PATH: /v/onboarding
 */

import express from 'express';
import {
  checkEmail,
  sendOTP,
  verifyOTP,
  createAccountEndpoint,
  generateRecoveryKey,
  completeOnboardingEndpoint,
} from '../controllers/OnboardingController';

const router = express.Router();

/**
 * @route   POST /v/onboarding/check-email
 * @desc    Check if email already exists
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com"
 * }
 * 
 * RESPONSE:
 * {
 *   "exists": false,
 *   "message": "Email is available"
 * }
 */
router.post('/check-email', checkEmail);

/**
 * @route   POST /v/onboarding/send-otp
 * @desc    Send OTP to email for verification
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "OTP sent successfully",
 *   "expiresIn": 600
 * }
 */
router.post('/send-otp', sendOTP);

/**
 * @route   POST /v/onboarding/verify-otp
 * @desc    Verify OTP code
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com",
 *   "otp": "123456"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "OTP verified successfully",
 *   "verified": true
 * }
 */
router.post('/verify-otp', verifyOTP);

/**
 * @route   POST /v/onboarding/create-account
 * @desc    Create a new user account
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com",
 *   "fullName": "John Doe",
 *   "password": "SecurePassword123!",
 *   "signupMethod": "email",
 *   "planId": "individual",
 *   "companyName": "Acme Corp" (optional, for team/business),
 *   "phoneNumber": "+1234567890" (optional, for team/business),
 *   "companyDomain": "acme.com" (optional, for business),
 *   "googleCredential": "..." (optional, for Google signup)
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Account created successfully",
 *   "success": true,
 *   "userId": "507f1f77bcf86cd799439011",
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "planId": "individual"
 *   }
 * }
 */
router.post('/create-account', createAccountEndpoint);

/**
 * @route   POST /v/onboarding/generate-recovery-key
 * @desc    Generate recovery key for user
 * @access  Public (should be protected in production)
 * 
 * REQUEST BODY:
 * {
 *   "userId": "507f1f77bcf86cd799439011"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Recovery key generated successfully",
 *   "recoveryKey": "base64encodedkey...",
 *   "masterPassword": "base64encodedpassword...",
 *   "encryptedData": "base64encodeddata..."
 * }
 */
router.post('/generate-recovery-key', generateRecoveryKey);

/**
 * @route   POST /v/onboarding/complete
 * @desc    Complete onboarding process
 * @access  Public (should be protected in production)
 * 
 * REQUEST BODY:
 * {
 *   "userId": "507f1f77bcf86cd799439011"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Onboarding completed successfully",
 *   "token": "jwt_token_here",
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "planId": "individual"
 *   }
 * }
 */
router.post('/complete', completeOnboardingEndpoint);

export default router;

