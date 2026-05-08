import { Router } from 'express';
import {
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

const router = Router();

router.post('/login', mobileLogin);
router.post('/oauth/google', mobileGoogleOAuth);
router.post('/oauth/google/complete-welcome', authMiddleware, mobileCompleteOAuthWelcome);
router.post('/oauth/google/verify-otp', oauthPendingAuthMiddleware, mobileGoogleVerifyOtp);
router.post('/oauth/google/resend-otp', oauthPendingAuthMiddleware, mobileGoogleResendOtp);
router.post('/2fa/verify', mobileVerifyTwoFactor);
router.post('/logout', sessionOrPendingAuthMiddleware, mobileLogout);
router.get('/validate-session', sessionOrPendingAuthMiddleware, mobileValidateSession);

export default router;
