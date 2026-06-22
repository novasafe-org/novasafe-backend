import type { Express } from 'express';

import { createBlogProxyRoutes } from './blog-proxy.routes';

export const BLOG_PROXY_PATH = '/blog';

/** Public blog proxy — GET /api/v1/blog/posts, /posts/:slug, /categories */
export const registerBlogProxyModule = (app: Express, apiPrefix: string): void => {
  const routes = createBlogProxyRoutes();
  app.use(`${apiPrefix}${BLOG_PROXY_PATH}`, routes);
};
