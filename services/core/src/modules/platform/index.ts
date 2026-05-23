import { Express } from 'express';
import { createAppRoutes } from './routes/app.routes';

export const registerPlatformModule = (app: Express, _apiPrefix: string): void => {
  app.use('/mobile/app', createAppRoutes());
};
