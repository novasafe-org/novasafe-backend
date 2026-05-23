import { Router } from 'express';
import { checkEmail, createAccount, sendOtp, verifyOtp } from '../controllers/onboarding.controller';

export const createOnboardingRoutes = (): Router => {
  const router = Router();
  router.post('/check-email', checkEmail);
  router.post('/send-otp', sendOtp);
  router.post('/verify-otp', verifyOtp);
  router.post('/create-account', createAccount);
  return router;
};
