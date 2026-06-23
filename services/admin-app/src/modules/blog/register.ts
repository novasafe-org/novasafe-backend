import type { Express } from 'express';
import { getRequestListener } from '@hono/node-server';

/** Paths handled by the Hono blog app — must NOT pass through express.json() (body stream is consumed). */
export const BLOG_API_PREFIXES = [
  '/api/v1/posts',
  '/api/v1/categories',
  '/api/v1/tags',
  '/api/v1/media',
  '/api/v1/seo',
] as const;

export function isBlogApiPath(path: string): boolean {
  return BLOG_API_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function registerBlogRoutes(app: Express): Promise<void> {
  const { app: blogHono } = await import('./app');
  const handler = getRequestListener(blogHono.fetch);

  app.use((req, res, next) => {
    if (isBlogApiPath(req.path)) {
      return handler(req, res);
    }
    return next();
  });
}
