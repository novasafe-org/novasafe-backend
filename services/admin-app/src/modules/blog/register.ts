import type { Express } from 'express';
import { getRequestListener } from '@hono/node-server';

const BLOG_PREFIXES = [
  '/api/v1/posts',
  '/api/v1/categories',
  '/api/v1/tags',
  '/api/v1/media',
  '/api/v1/seo',
];

export async function registerBlogRoutes(app: Express): Promise<void> {
  const { app: blogHono } = await import('./app');
  const handler = getRequestListener(blogHono.fetch);

  app.use((req, res, next) => {
    if (BLOG_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return handler(req, res);
    }
    return next();
  });
}
