import { Router } from 'express';
import { asyncHandler } from '../../../middleware/async-handler';
import { checkEmail, createAccount, sendOtp, verifyOtp } from '../controllers/onboarding.controller';

export const createOnboardingRoutes = (): Router => {
  const router = Router();
  router.post('/check-email', asyncHandler(checkEmail));
  router.post('/send-otp', asyncHandler(sendOtp));
  router.post('/verify-otp', asyncHandler(verifyOtp));
  router.post('/create-account', asyncHandler(createAccount));
  return router;
};
