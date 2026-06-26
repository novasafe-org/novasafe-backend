import { Router } from 'express';
import { asyncHandler } from '../../../middleware/async-handler';
import { authRateLimiter } from '../../../middleware/rate-limit.middleware';
import { checkEmail, createAccount, sendOtp, verifyOtp } from '../controllers/onboarding.controller';

export const createOnboardingRoutes = (): Router => {
  const router = Router();
  router.post('/check-email', authRateLimiter, asyncHandler(checkEmail));
  router.post('/send-otp', authRateLimiter, asyncHandler(sendOtp));
  router.post('/verify-otp', authRateLimiter, asyncHandler(verifyOtp));
  router.post('/create-account', authRateLimiter, asyncHandler(createAccount));
  return router;
};
