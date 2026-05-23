import { Express } from 'express';
import { createSettingsRoutes } from './routes/settings.routes';

export const SETTINGS_MODULE_NAME = 'settings';

/**
 * Profile & settings — sync, 2FA, sessions, export/import, account deletion.
 * Legacy path: `/mobile/settings/*`
 */
export const registerSettingsModule = (app: Express, apiPrefix: string): void => {
  const routes = createSettingsRoutes();
  app.use(`${apiPrefix}/${SETTINGS_MODULE_NAME}`, routes);
  app.use('/mobile/settings', routes);
};
