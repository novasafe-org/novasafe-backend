import { Router, type Request, type Response } from 'express';

import { logger } from '../../shared/logger';

/**
 * Public blog reads for the marketing site — proxied to admin-api on the internal Docker network.
 * Landing only calls core; admin-api must be running for blog routes to work.
 */
const PROXY_TIMEOUT_MS = 8_000;

const adminApiBase = (): string =>
  (process.env.ADMIN_API_URL || 'http://localhost:3130').replace(/\/$/, '');

function sendBlogUnavailable(res: Response, reason: string): void {
  res.status(503).json({
    success: false,
    message: 'Blog service temporarily unavailable',
    hint: 'Ensure novasafe-admin-api is running and ADMIN_API_URL is set on mobile-api',
    reason,
  });
}

async function proxyGet(
  req: Request,
  res: Response,
  path: string,
  query?: Record<string, unknown>,
): Promise<void> {
  const qs = query ? new URLSearchParams(query as Record<string, string>).toString() : '';
  const url = `${adminApiBase()}/api/v1${path}${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn('Blog proxy failed', { url, reason });
    sendBlogUnavailable(res, reason);
  } finally {
    clearTimeout(timer);
  }
}

export function createBlogProxyRoutes(): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const response = await fetch(`${adminApiBase()}/health`, { signal: controller.signal });
      const ok = response.ok;
      res.status(ok ? 200 : 503).json({
        success: ok,
        proxy: 'blog',
        adminApi: adminApiBase(),
        adminStatus: response.status,
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        proxy: 'blog',
        adminApi: adminApiBase(),
        message: err instanceof Error ? err.message : 'admin-api unreachable',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  router.get('/posts', (req, res) => void proxyGet(req, res, '/posts', req.query as Record<string, unknown>));

  router.get('/categories', (req, res) => void proxyGet(req, res, '/categories'));

  router.get('/posts/:slug', (req, res) =>
    void proxyGet(req, res, `/posts/${encodeURIComponent(req.params.slug)}`),
  );

  router.get('/media/:id', async (req, res) => {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${adminApiBase()}/api/v1/media/${encodeURIComponent(req.params.id)}${qs ? `?${qs}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      res.status(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      logger.warn('Blog media proxy failed', { url, err });
      sendBlogUnavailable(res, err instanceof Error ? err.message : 'media proxy failed');
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
