import { Router, type Request, type Response } from 'express';

import { logger } from '../../shared/logger';
import { authMiddleware, requirePermission } from '../rbac/rbac.service';

const PROXY_TIMEOUT_MS = 8_000;

const CORE_API_URL = (): string => {
  const configured = process.env.CORE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  // Docker Compose service name when admin-api runs in the same stack as core
  if (process.env.NODE_ENV === 'production') {
    return 'http://novasafe-mobile-vault:3124';
  }
  return 'http://localhost:3125';
};

const STATUS_SECRET = () => process.env.STATUS_PAGE_ADMIN_SECRET?.trim() || '';

function sendProxyError(res: Response, err: unknown, corePath: string): void {
  const reason = err instanceof Error ? err.message : String(err);
  logger.warn('Status proxy failed', { corePath, coreApi: CORE_API_URL(), reason });
  res.status(503).json({
    success: false,
    message: 'Status service temporarily unavailable',
    hint: 'Set CORE_API_URL on admin-api (e.g. http://novasafe-mobile-vault:3124) and ensure core is running',
    reason,
  });
}

async function proxyGet(req: Request, res: Response, corePath: string): Promise<void> {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  const url = `${CORE_API_URL()}${corePath}${qs ? `?${qs}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    res.status(response.status);
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    sendProxyError(res, err, corePath);
  } finally {
    clearTimeout(timer);
  }
}

async function proxyToCore(req: Request, res: Response, corePath: string, method: string): Promise<void> {
  const url = `${CORE_API_URL()}${corePath}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const secret = STATUS_SECRET();
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(req.body ?? {}),
      signal: controller.signal,
    });
    const text = await response.text();
    res.status(response.status);
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    sendProxyError(res, err, corePath);
  } finally {
    clearTimeout(timer);
  }
}

export function createStatusAdminRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/overview', requirePermission('system.read', 'read'), (req, res) =>
    void proxyGet(req, res, '/status'),
  );

  router.get('/services', requirePermission('system.read', 'read'), (req, res) =>
    void proxyGet(req, res, '/status/services'),
  );

  router.get('/incidents', requirePermission('system.read', 'read'), (req, res) =>
    void proxyGet(req, res, '/status/incidents'),
  );

  router.get('/incidents/:slug', requirePermission('system.read', 'read'), (req, res) =>
    void proxyGet(req, res, `/status/incidents/${encodeURIComponent(req.params.slug)}`),
  );

  router.get('/history', requirePermission('system.read', 'read'), (req, res) =>
    void proxyGet(req, res, '/status/history'),
  );

  router.post('/services', requirePermission('system.manage', 'manage'), (req, res) =>
    void proxyToCore(req, res, '/admin/status/services', 'POST'),
  );

  router.post('/incidents', requirePermission('system.manage', 'manage'), (req, res) =>
    void proxyToCore(req, res, '/admin/status/incidents', 'POST'),
  );

  router.put('/incidents/:id', requirePermission('system.manage', 'manage'), (req, res) =>
    void proxyToCore(req, res, `/admin/status/incidents/${req.params.id}`, 'PUT'),
  );

  router.post('/incidents/:id/resolve', requirePermission('system.manage', 'manage'), (req, res) =>
    void proxyToCore(req, res, `/admin/status/incidents/${req.params.id}/resolve`, 'POST'),
  );

  return router;
}
