import { Router } from 'express';
import { createRateLimiter } from '../../../middleware/rate-limit.middleware';
import {
  confirmAccountDeletionByEmail,
  requestAccountDeletionByEmail,
} from '../controllers/public-account-deletion.controller';

const deletionRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    return `account-deletion:${ip}:${email || 'no-email'}`;
  },
  message: 'Too many deletion requests. Try again later.',
});

export const createPublicAccountDeletionRoutes = (): Router => {
  const router = Router();
  router.post('/', deletionRequestLimiter, requestAccountDeletionByEmail);
  router.post('/confirm', deletionRequestLimiter, confirmAccountDeletionByEmail);
  return router;
};
