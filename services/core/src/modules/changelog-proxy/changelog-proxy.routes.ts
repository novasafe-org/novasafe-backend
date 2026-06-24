import { Router, type Request, type Response } from 'express';

import { logger } from '../../shared/logger';

const PROXY_TIMEOUT_MS = 8_000;

const adminApiBase = (): string =>
  (process.env.ADMIN_API_URL || 'http://localhost:3130').replace(/\/$/, '');

function sendUnavailable(res: Response, reason: string): void {
  res.status(503).json({
    success: false,
    message: 'Changelog service temporarily unavailable',
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
  const url = `${adminApiBase()}/api/v1/changelog${path}${qs ? `?${qs}` : ''}`;

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
    logger.warn('Changelog proxy failed', { url, reason });
    sendUnavailable(res, reason);
  } finally {
    clearTimeout(timer);
  }
}

export function createChangelogProxyRoutes(): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const response = await fetch(`${adminApiBase()}/health`, { signal: controller.signal });
      const ok = response.ok;
      res.status(ok ? 200 : 503).json({
        success: ok,
        proxy: 'changelog',
        adminApi: adminApiBase(),
        adminStatus: response.status,
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        proxy: 'changelog',
        adminApi: adminApiBase(),
        message: err instanceof Error ? err.message : 'admin-api unreachable',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  router.get('/', (req, res) => void proxyGet(req, res, '', req.query as Record<string, unknown>));

  router.get('/:id', (req, res) =>
    void proxyGet(req, res, `/${encodeURIComponent(req.params.id)}`),
  );

  return router;
}
