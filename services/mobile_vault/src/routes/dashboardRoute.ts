import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getMobileDashboard, getMobileSecuritySummary } from '../controllers/mobileDashboardController';

const router = Router();

router.get('/overview', authMiddleware, getMobileDashboard);
router.get('/security/summary', authMiddleware, getMobileSecuritySummary);

export default router;
