import { Express } from 'express';
import { createAppRoutes } from './routes/app.routes';
import { createPlatformFeatureFlagRoutes } from './routes/feature-flags.routes';

export const registerPlatformModule = (app: Express, apiPrefix: string): void => {
  app.use('/mobile/app', createAppRoutes());
  app.use(`${apiPrefix}/platform`, createPlatformFeatureFlagRoutes());
};
