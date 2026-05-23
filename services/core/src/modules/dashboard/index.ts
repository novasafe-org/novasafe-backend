import { Express } from 'express';
import { createDashboardRoutes } from './routes/dashboard.routes';
import { authMiddleware } from '../auth';
import { getMobileSecuritySummary } from './controllers/dashboard.controller';

export const DASHBOARD_MODULE_NAME = 'dashboard';

export const registerDashboardModule = (app: Express, apiPrefix: string): void => {
  const routes = createDashboardRoutes();
  app.use(`${apiPrefix}/${DASHBOARD_MODULE_NAME}`, routes);
  app.use('/mobile/dashboard', routes);
  /** Legacy single endpoint from mobile_vault app.ts */
  app.get('/mobile/security/summary', authMiddleware, getMobileSecuritySummary);
};
