import { Express } from 'express';
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

  const publicDeletion = createPublicAccountDeletionRoutes();
  app.use(`${apiPrefix}/public/account-deletion`, publicDeletion);
};
