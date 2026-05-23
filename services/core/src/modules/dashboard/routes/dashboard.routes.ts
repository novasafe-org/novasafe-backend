import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { getMobileDashboard, getMobileSecuritySummary } from '../controllers/dashboard.controller';

export const createDashboardRoutes = (): Router => {
  const router = Router();
  router.get('/overview', authMiddleware, getMobileDashboard);
  router.get('/security/summary', authMiddleware, getMobileSecuritySummary);
  return router;
};
