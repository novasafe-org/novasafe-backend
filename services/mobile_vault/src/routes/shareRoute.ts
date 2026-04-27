import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { listShares, sendShareInvite } from '../controllers/mobileShareController';

const router = Router();

router.get('/list', authMiddleware, listShares);
router.post('/send', authMiddleware, sendShareInvite);

export default router;
