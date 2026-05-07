import { Router } from 'express';
import { mobileGoogleOAuth, mobileLogin, mobileLogout, mobileValidateSession, mobileVerifyTwoFactor } from '../controllers/mobileAuthController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/login', mobileLogin);
router.post('/oauth/google', mobileGoogleOAuth);
router.post('/2fa/verify', mobileVerifyTwoFactor);
router.post('/logout', authMiddleware, mobileLogout);
router.get('/validate-session', authMiddleware, mobileValidateSession);

export default router;
