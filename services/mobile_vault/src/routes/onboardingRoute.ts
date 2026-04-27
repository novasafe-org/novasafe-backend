import { Router } from 'express';
import {
  checkEmail,
  createAccount,
  sendOtp,
  verifyOtp,
} from '../controllers/mobileOnboardingController';

const router = Router();

router.post('/check-email', checkEmail);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/create-account', createAccount);

export default router;
