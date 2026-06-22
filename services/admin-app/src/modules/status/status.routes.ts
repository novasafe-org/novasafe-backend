import { Router, type Request, type Response } from 'express';

import { authMiddleware, requirePermission } from '../rbac/rbac.service';

const CORE_API_URL = () => (process.env.CORE_API_URL || 'http://localhost:3125').replace(/\/$/, '');
const STATUS_SECRET = () => process.env.STATUS_PAGE_ADMIN_SECRET?.trim() || '';

async function proxyToCore(req: Request, res: Response, corePath: string, method: string): Promise<void> {
  const url = `${CORE_API_URL()}${corePath}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const secret = STATUS_SECRET();
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(req.body ?? {}),
  });

  const text = await response.text();
  res.status(response.status);
  try {
    res.json(JSON.parse(text));
  } catch {
    res.send(text);
  }
}

export function createStatusAdminRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(requirePermission('system.manage', 'read'));

  router.get('/overview', async (_req, res) => {
    const response = await fetch(`${CORE_API_URL()}/status`);
    res.status(response.status).json(await response.json());
  });

  router.get('/services', async (_req, res) => {
    const response = await fetch(`${CORE_API_URL()}/status/services`);
    res.status(response.status).json(await response.json());
  });

  router.get('/incidents', async (req, res) => {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const response = await fetch(`${CORE_API_URL()}/status/incidents?${qs}`);
    res.status(response.status).json(await response.json());
  });

  router.get('/incidents/:slug', async (req, res) => {
    const response = await fetch(`${CORE_API_URL()}/status/incidents/${encodeURIComponent(req.params.slug)}`);
    res.status(response.status).json(await response.json());
  });

  router.get('/history', async (req, res) => {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const response = await fetch(`${CORE_API_URL()}/status/history?${qs}`);
    res.status(response.status).json(await response.json());
  });

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
