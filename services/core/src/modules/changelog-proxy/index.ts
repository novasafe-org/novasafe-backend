import type { Express } from 'express';

import { createChangelogProxyRoutes } from './changelog-proxy.routes';

export const CHANGELOG_PROXY_PATH = '/changelog';

/** Public changelog proxy — GET /api/v1/changelog → admin-api */
export const registerChangelogProxyModule = (app: Express, apiPrefix: string): void => {
  const routes = createChangelogProxyRoutes();
  app.use(`${apiPrefix}${CHANGELOG_PROXY_PATH}`, routes);
};
