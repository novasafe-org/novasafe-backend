import express from 'express';

import { registerAdminModules } from './modules';
import { logger } from './shared/logger';

const API_PREFIX = '/api/v1';

const app = express();

const corsOrigins = (process.env.ADMIN_CORS_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (corsOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'admin-app', status: 'ok' });
});

app.get(`${API_PREFIX}/health`, (_req, res) => {
  res.json({ success: true, service: 'admin-app', status: 'ok' });
});

let modulesReady = false;

export async function initializeApp(): Promise<void> {
  if (modulesReady) return;

  await registerAdminModules(app, API_PREFIX);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  });

  modulesReady = true;
  logger.info('Admin modules registered');
}

export default app;
