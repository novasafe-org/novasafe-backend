import { Express } from 'express';
import { createFoldersRoutes } from './routes/folders.routes';

export const FOLDERS_MODULE_NAME = 'folders';

/**
 * Flat vault folders — list/create/update/delete with item counts.
 * Registers `/api/v1/folders/*` and legacy `/mobile/folders/*`.
 */
export const registerFoldersModule = (app: Express, apiPrefix: string): void => {
  const routes = createFoldersRoutes();
  app.use(`${apiPrefix}/${FOLDERS_MODULE_NAME}`, routes);
  app.use('/mobile/folders', routes);
};

export { createFoldersRoutes } from './routes/folders.routes';
