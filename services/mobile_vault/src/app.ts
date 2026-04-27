import express from 'express';
import authRoute from './routes/authRoute';
import vaultRoute from './routes/vaultRoute';
import dashboardRoute from './routes/dashboardRoute';
import settingsRoute from './routes/settingsRoute';
import onboardingRoute from './routes/onboardingRoute';
import shareRoute from './routes/shareRoute';
import { sourceMiddleware } from './middleware/sourceMiddleware';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './logger';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Workspace-Id, X-Source');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});
app.use(sourceMiddleware);

app.use('/mobile/health', (_req, res) => {
  res.status(200).json({ success: true, source: 'mobile', status: 'ok' });
});
app.use('/mobile/auth', authRoute);
app.use('/mobile/vault', vaultRoute);
app.use('/mobile/dashboard', dashboardRoute);
app.use('/mobile/settings', settingsRoute);
app.use('/mobile/onboarding', onboardingRoute);
app.use('/mobile/share', shareRoute);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
