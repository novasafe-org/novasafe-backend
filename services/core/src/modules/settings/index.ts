import { Express, Router } from 'express';
import { authMiddleware } from '../auth';
import { asyncHandler } from '../../middleware/async-handler';
import { registerPushToken } from './controllers/devices.controller';
import { createSettingsRoutes } from './routes/settings.routes';
import { createPublicAccountDeletionRoutes } from './routes/public-account-deletion.routes';

export const SETTINGS_MODULE_NAME = 'settings';

/**
 * Profile & settings — sync, 2FA, sessions, export/import, account deletion.
 * Legacy path: `/mobile/settings/*`
 * Public web deletion request: `/api/v1/public/account-deletion`
 */
export const registerSettingsModule = (app: Express, apiPrefix: string): void => {
  const routes = createSettingsRoutes();
  app.use(`${apiPrefix}/${SETTINGS_MODULE_NAME}`, routes);
  app.use('/mobile/settings', routes);

  // Capacitor / legacy alias used by web native push client.
  const push = Router();
  push.post('/register', authMiddleware, asyncHandler(registerPushToken));
  app.use('/mobile/push', push);

  const publicDeletion = createPublicAccountDeletionRoutes();
  app.use(`${apiPrefix}/public/account-deletion`, publicDeletion);
};
