import { Router } from 'express';
import { asyncHandler } from '../../../middleware/async-handler';
import { authRateLimiter } from '../../../middleware/rate-limit.middleware';
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
  createExtensionPairingHandoff,
  redeemExtensionPairing,
  requestPasswordReset,
  confirmPasswordReset,
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

  router.post('/login', authRateLimiter, asyncHandler(login));
  router.post('/oauth/google', authRateLimiter, asyncHandler(googleOAuth));
  router.post('/oauth/apple', authRateLimiter, asyncHandler(appleOAuth));
  router.post('/oauth/google/complete-welcome', authMiddleware, asyncHandler(completeOAuthWelcome));
  router.post('/oauth/google/verify-otp', oauthPendingAuthMiddleware, authRateLimiter, asyncHandler(googleVerifyOtp));
  router.post('/oauth/google/resend-otp', oauthPendingAuthMiddleware, authRateLimiter, asyncHandler(googleResendOtp));
  router.post('/oauth/apple/verify-otp', oauthPendingAuthMiddleware, authRateLimiter, asyncHandler(appleVerifyOtp));
  router.post('/oauth/apple/resend-otp', oauthPendingAuthMiddleware, authRateLimiter, asyncHandler(appleResendOtp));
  router.post('/2fa/verify', authRateLimiter, asyncHandler(verifyTwoFactor));
  router.post('/logout', sessionOrPendingAuthMiddleware, asyncHandler(logout));
  router.post('/extension/pair', authMiddleware, asyncHandler(pairExtension));
  router.post('/extension/pairing-handoff', authMiddleware, asyncHandler(createExtensionPairingHandoff));
  router.post('/extension/redeem-pairing', authRateLimiter, asyncHandler(redeemExtensionPairing));
  router.post('/password-reset/request', authRateLimiter, asyncHandler(requestPasswordReset));
  router.post('/password-reset/confirm', authRateLimiter, asyncHandler(confirmPasswordReset));
  router.get('/validate-session', sessionOrPendingAuthMiddleware, asyncHandler(validateSession));

  return router;
};
