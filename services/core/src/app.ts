import express from 'express';
import { ConnectionManager, type ConnectionManagerStatus } from './database';
import { isOriginAllowed } from './config/cors.config';
import { applyExpressLogging, getExpressErrorLogger } from './shared/logger/adapters';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';
import { requestContextMiddleware } from './shared/request-context';
import { registerModuleRoutes } from './modules';
import { getBuildInfo, getVersionPayload } from './shared/build-info';

const app = express();

app.use(express.json({ limit: '1mb' }));
/** Platform request intelligence (source, trace, ALS) — must run before logging and routes. */
app.use(requestContextMiddleware);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Source',
      'X-Tenant',
      'X-Request-Id',
      'X-Correlation-Id',
      'X-Trace-Id',
      'X-Client-Source',
      'X-Client-Platform',
      'X-Client-Version',
      'X-Build-Version',
      'X-Device-Id',
      'X-Session-Id',
      'X-Api-Version',
      'X-Client-Region',
      'X-Client-Id',
      'X-Client-Signature',
      'X-Client-Timestamp',
      'X-Client-Nonce',
      'X-Client-Attestation',
      'X-Trust-Level',
      'X-Verified-Source',
    ].join(', '),
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

applyExpressLogging(app, { request: true, error: false });

const buildHealthPayload = async () => {
  let db: ConnectionManagerStatus = {
    state: 'disconnected' as ConnectionManagerStatus['state'],
    ready: false,
    dbName: '',
  };
  let dbPing = false;
  try {
    const manager = ConnectionManager.getInstance();
    db = manager.getStatus();
    dbPing = await manager.ping();
  } catch {
    dbPing = false;
  }
  return {
    success: db.ready && dbPing,
    service: 'core',
    status: db.ready && dbPing ? 'ok' : 'degraded',
    version: getBuildInfo('novasafe-mobile-api').version,
    database: {
      state: db.state,
      ready: db.ready,
      ping: dbPing,
      dbName: db.dbName,
      host: db.host,
    },
  };
};

app.get('/health', async (_req, res) => {
  const payload = await buildHealthPayload();
  res.status(payload.success ? 200 : 503).json(payload);
});

app.get('/api/v1/health', async (_req, res) => {
  const payload = await buildHealthPayload();
  res.status(payload.success ? 200 : 503).json({ ...payload, version: 'v1' });
});

/** Legacy mobile_vault path — used by production nginx / docker healthcheck. */
app.get('/mobile/health', async (_req, res) => {
  const payload = await buildHealthPayload();
  res.status(payload.success ? 200 : 503).json({ ...payload, source: 'mobile' });
});

app.get('/version', (_req, res) => {
  res.json(getVersionPayload('novasafe-mobile-api'));
});

app.get('/version.json', (_req, res) => {
  res.json(getBuildInfo('novasafe-mobile-api'));
});

registerModuleRoutes(app);

app.use(notFoundHandler);
app.use(getExpressErrorLogger());
app.use(errorHandler);

export default app;

