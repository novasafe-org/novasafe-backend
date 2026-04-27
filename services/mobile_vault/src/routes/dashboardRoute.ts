import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getMobileDashboard } from '../controllers/mobileDashboardController';

const router = Router();

router.get('/overview', authMiddleware, getMobileDashboard);

export default router;
