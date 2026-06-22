import { Router } from 'express';

/**
 * Public blog reads for the marketing site — proxied to admin-api on the internal network.
 * Keeps admin-api off the public internet; landing only talks to core (api.novasafe.io).
 */
const adminApiBase = (): string =>
  (process.env.ADMIN_API_URL || 'http://localhost:3130').replace(/\/$/, '');

async function proxyGet(res: import('express').Response, path: string, query?: Record<string, unknown>): Promise<void> {
  const qs = query ? new URLSearchParams(query as Record<string, string>).toString() : '';
  const url = `${adminApiBase()}/api/v1${path}${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  res.status(response.status);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  try {
    res.json(JSON.parse(text));
  } catch {
    res.send(text);
  }
}

export function createBlogProxyRoutes(): Router {
  const router = Router();

  router.get('/posts', (req, res) => void proxyGet(res, '/posts', req.query as Record<string, unknown>));

  router.get('/categories', (_req, res) => void proxyGet(res, '/categories'));

  router.get('/posts/:slug', (req, res) =>
    void proxyGet(res, `/posts/${encodeURIComponent(req.params.slug)}`),
  );

  router.get('/media/:id', async (req, res) => {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${adminApiBase()}/api/v1/media/${encodeURIComponent(req.params.id)}${qs ? `?${qs}` : ''}`;
    const response = await fetch(url);
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  });

  return router;
}
