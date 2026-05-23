import { Express } from 'express';
import { createDocsRoutes } from './docs.routes';

export const registerDocsModule = (app: Express, apiPrefix: string): void => {
  app.use(apiPrefix, createDocsRoutes());
};
