import { Express } from 'express';
import { createAuthenticatorRoutes } from './routes/authenticator.routes';

export const AUTHENTICATOR_MODULE_NAME = 'authenticator';

/**
 * Authenticator / TOTP entries — standalone or linked to vault items.
 * Registers `/api/v1/authenticator/*` and legacy `/mobile/authenticator/*`.
 */
export const registerAuthenticatorModule = (app: Express, apiPrefix: string): void => {
  const routes = createAuthenticatorRoutes();
  app.use(`${apiPrefix}/${AUTHENTICATOR_MODULE_NAME}`, routes);
  app.use('/mobile/authenticator', routes);
};

export { createAuthenticatorRoutes } from './routes/authenticator.routes';
export {
  syncAuthenticatorForVaultItem,
  linkAuthenticatorToItem,
  findAuthenticatorByVaultItemId,
} from './services/authenticator.service';
