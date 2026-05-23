import express from 'express';
import path from 'path';
import { securityGateMiddleware } from './middleware/security.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { createPlaygroundRoutes } from './playground/playground.routes';
import { mountScalarDocs } from './ui/scalar.setup';

const app = express();

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    [
      'Origin',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Playground-Api-Key',
      'X-Playground-Environment',
      'X-Playground-Client-Profile',
      'X-Playground-Access-Token',
      'X-Client-Source',
      'X-Client-Platform',
      'X-Api-Version',
      'X-Request-Id',
      'X-Trace-Id',
    ].join(', '),
  );
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'api-playground', status: 'ok' });
});

app.use(requestLoggerMiddleware);
app.use(securityGateMiddleware);

app.use('/api/playground', createPlaygroundRoutes());
app.use('/public', express.static(path.join(__dirname, '../public')));

mountScalarDocs(app);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not found. API Playground docs: /docs',
  });
});

export default app;
