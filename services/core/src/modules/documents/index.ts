import { Express } from 'express';
import { createDocumentsRoutes } from './routes/documents.routes';

export const DOCUMENTS_MODULE_NAME = 'documents';

/**
 * Vault documents — metadata in Mongo `documents`, binary via NAS-Control agent.
 * Registers `/api/v1/documents/*` and legacy `/mobile/documents/*`.
 */
export const registerDocumentsModule = (app: Express, apiPrefix: string): void => {
  const routes = createDocumentsRoutes();
  app.use(`${apiPrefix}/${DOCUMENTS_MODULE_NAME}`, routes);
  app.use('/mobile/documents', routes);
};

export { createDocumentsRoutes } from './routes/documents.routes';
