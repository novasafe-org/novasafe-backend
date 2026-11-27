import { Express } from 'express';
import { createCardsRoutes } from './routes/cards.routes';

export const CARDS_MODULE_NAME = 'cards';

/**
 * Cards — encrypted card storage (no transactions/payments).
 * Paths: `/api/v1/cards/*` and legacy `/mobile/cards/*`.
 */
export const registerCardsModule = (app: Express, apiPrefix: string): void => {
  const routes = createCardsRoutes();
  app.use(`${apiPrefix}/${CARDS_MODULE_NAME}`, routes);
  app.use('/mobile/cards', routes);
};

export { createCardsRoutes } from './routes/cards.routes';
