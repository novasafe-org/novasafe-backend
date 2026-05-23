import { Express } from 'express';
import { createSubscriptionRoutes } from './routes/subscription.routes';

export const SUBSCRIPTIONS_MODULE_NAME = 'subscriptions';

export {
  assertCanCreateVaultItem,
  assertEntitlement,
  getSubscriptionStateForUser,
  hasEntitlement,
} from './services/subscription.service';

export type { SubscriptionState } from './services/subscription.service';
export type { EntitlementKey } from './config/subscription.config';

export const registerSubscriptionsModule = (app: Express, apiPrefix: string): void => {
  const routes = createSubscriptionRoutes();
  app.use(`${apiPrefix}/${SUBSCRIPTIONS_MODULE_NAME}`, routes);
  app.use('/mobile/subscriptions', routes);
};
