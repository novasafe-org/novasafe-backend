import { Express } from 'express';
import { createVaultRoutes } from './routes/vault.routes';

export const VAULT_MODULE_NAME = 'vault';

/**
 * Vault module — credentials, custom fields, password history, sync.
 * Registers `/api/v1/vault/*` and legacy `/mobile/vault/*` (mobile_vault parity).
 */
export const registerVaultModule = (app: Express, apiPrefix: string): void => {
  const routes = createVaultRoutes();
  app.use(`${apiPrefix}/${VAULT_MODULE_NAME}`, routes);
  app.use('/mobile/vault', routes);
};

export { createVaultRoutes } from './routes/vault.routes';
