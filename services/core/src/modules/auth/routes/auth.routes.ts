import { Router } from 'express';
import { asyncHandler } from '../../../middleware/async-handler';
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
  pairExtension,
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

  router.post('/login', asyncHandler(login));
  router.post('/oauth/google', asyncHandler(googleOAuth));
  router.post('/oauth/apple', asyncHandler(appleOAuth));
  router.post('/oauth/google/complete-welcome', authMiddleware, asyncHandler(completeOAuthWelcome));
  router.post('/oauth/google/verify-otp', oauthPendingAuthMiddleware, asyncHandler(googleVerifyOtp));
  router.post('/oauth/google/resend-otp', oauthPendingAuthMiddleware, asyncHandler(googleResendOtp));
  router.post('/oauth/apple/verify-otp', oauthPendingAuthMiddleware, asyncHandler(appleVerifyOtp));
  router.post('/oauth/apple/resend-otp', oauthPendingAuthMiddleware, asyncHandler(appleResendOtp));
  router.post('/2fa/verify', asyncHandler(verifyTwoFactor));
  router.post('/logout', sessionOrPendingAuthMiddleware, asyncHandler(logout));
  router.post('/extension/pair', authMiddleware, asyncHandler(pairExtension));
  router.get('/validate-session', sessionOrPendingAuthMiddleware, asyncHandler(validateSession));

  return router;
};
