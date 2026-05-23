import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { listShares, sendShareInvite } from '../controllers/share.controller';

export const createShareRoutes = (): Router => {
  const router = Router();
  router.get('/list', authMiddleware, listShares);
  router.post('/send', authMiddleware, sendShareInvite);
  return router;
};
