import { Router } from 'express';
import {
  mobileAppleOAuth,
  mobileAppleResendOtp,
  mobileAppleVerifyOtp,
  mobileCompleteOAuthWelcome,
  mobileGoogleOAuth,
  mobileGoogleResendOtp,
  mobileGoogleVerifyOtp,
  mobileLogin,
  mobileLogout,
  mobileValidateSession,
  mobileVerifyTwoFactor,
} from '../controllers/mobileAuthController';
import { authMiddleware, oauthPendingAuthMiddleware, sessionOrPendingAuthMiddleware } from '../middleware/auth';
import { sendVaultPinResetOtp, verifyVaultPinResetOtp } from '../controllers/mobileSettingsController';

const router = Router();

router.post('/login', mobileLogin);
router.post('/oauth/google', mobileGoogleOAuth);
router.post('/oauth/apple', mobileAppleOAuth);
router.post('/oauth/google/complete-welcome', authMiddleware, mobileCompleteOAuthWelcome);
router.post('/oauth/google/verify-otp', oauthPendingAuthMiddleware, mobileGoogleVerifyOtp);
router.post('/oauth/google/resend-otp', oauthPendingAuthMiddleware, mobileGoogleResendOtp);
router.post('/oauth/apple/verify-otp', oauthPendingAuthMiddleware, mobileAppleVerifyOtp);
router.post('/oauth/apple/resend-otp', oauthPendingAuthMiddleware, mobileAppleResendOtp);
router.post('/2fa/verify', mobileVerifyTwoFactor);
router.post('/logout', sessionOrPendingAuthMiddleware, mobileLogout);
router.get('/validate-session', sessionOrPendingAuthMiddleware, mobileValidateSession);
router.post('/vault-pin/send-otp', authMiddleware, sendVaultPinResetOtp);
router.post('/vault-pin/verify-otp', authMiddleware, verifyVaultPinResetOtp);

export default router;
