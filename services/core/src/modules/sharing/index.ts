import { Express } from 'express';
import { createShareRoutes } from './routes/share.routes';

export const SHARING_MODULE_NAME = 'share';

export const registerSharingModule = (app: Express, apiPrefix: string): void => {
  const routes = createShareRoutes();
  app.use(`${apiPrefix}/${SHARING_MODULE_NAME}`, routes);
  app.use('/mobile/share', routes);
};
