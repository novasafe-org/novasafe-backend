import { Router } from 'express';
import {
  appleOAuth,
  appleResendOtp,
  appleVerifyOtp,
  completeOAuthWelcome,
  googleOAuth,
  googleResendOtp,
  googleVerifyOtp,
  login,
  logout,
  validateSession,
  verifyTwoFactor,
} from '../controllers/auth.controller';
import {
  authMiddleware,
  oauthPendingAuthMiddleware,
  sessionOrPendingAuthMiddleware,
} from '../middleware/auth.middleware';

export const createAuthRoutes = (): Router => {
  const router = Router();

  router.post('/login', login);
  router.post('/oauth/google', googleOAuth);
  router.post('/oauth/apple', appleOAuth);
  router.post('/oauth/google/complete-welcome', authMiddleware, completeOAuthWelcome);
  router.post('/oauth/google/verify-otp', oauthPendingAuthMiddleware, googleVerifyOtp);
  router.post('/oauth/google/resend-otp', oauthPendingAuthMiddleware, googleResendOtp);
  router.post('/oauth/apple/verify-otp', oauthPendingAuthMiddleware, appleVerifyOtp);
  router.post('/oauth/apple/resend-otp', oauthPendingAuthMiddleware, appleResendOtp);
  router.post('/2fa/verify', verifyTwoFactor);
  router.post('/logout', sessionOrPendingAuthMiddleware, logout);
  router.get('/validate-session', sessionOrPendingAuthMiddleware, validateSession);

  return router;
};
