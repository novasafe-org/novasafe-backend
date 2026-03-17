import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import loggerMiddleware from './middlewares/logger/loggerMiddleware';
import healthRoute from './routes/healthRoute';
import vaultRoute from './routes/vaultRoute';
import authRoute from './routes/authRoute';
import totpRoute from './routes/totpRoute';
import sessionRoute from './routes/sessionRoute';
import folderRoute from './routes/folderRoute';
import settingsRoute from './routes/settingsRoute';
import shareRoute from './routes/shareRoute';
import pricingRoute from './routes/pricingRoute';
import geoRoute from './routes/geoRoute';
import paymentRoute from './routes/paymentRoute';
import subscriptionRoute from './routes/subscriptionRoute';
import onboardingRoute from './routes/onboardingRoute';
import accountRoute from './routes/accountRoute';
import billingRoute from './routes/billingRoute';
import workspaceRoute from './routes/workspaceRoute';
import activityLogRoutes from './routes/admin/activityLogRoutes';
import accessManagementRoutes from './routes/admin/accessManagementRoutes';
import invitationRoute from './routes/invitationRoute';
import secretsUIRoute from './routes/secretsUIRoute';
import secretsAPIRoute from './routes/secretsAPIRoute';
import patRoute from './routes/patRoute';
import serviceAccountRoute from './routes/serviceAccountRoute';
import Database from '../database/connection'; // Import Database class
import logger from './logger';
import { DBCONFIG } from '../config/config';

// Load .env file with explicit path resolution (works on both Windows and Mac)
// Try multiple locations to handle different project structures
const envPaths = [
  path.resolve(process.cwd(), '.env'), // Current working directory (most common)
  path.resolve(__dirname, '../../.env'), // Relative to compiled JS location
  path.resolve(__dirname, '../../../.env'), // Project root
];

let envLoaded = false;
for (const envPath of envPaths) {
  const envResult = dotenv.config({ path: envPath });
  if (!envResult.error) {
    logger.info({ path: envPath }, 'Environment variables loaded from .env file');
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  // Try default dotenv.config() as fallback
  const defaultResult = dotenv.config();
  if (!defaultResult.error) {
    logger.info('Environment variables loaded using default dotenv.config()');
  } else {
    logger.warn({ 
      error: defaultResult.error.message,
      triedPaths: envPaths,
      cwd: process.cwd(),
      __dirname: __dirname
    }, 'Failed to load .env file from any location. Using environment variables or defaults.');
  }
}

const app = express();
const PORT = process.env.PORT || 5001;
// Bind host: use 127.0.0.1 for local dev if you get "Connection reset by peer" with 0.0.0.0 (e.g. macOS)
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

// Add CORS and JSON parsing middleware
app.use(express.json());
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Workspace-Id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Use logging middleware
app.use(loggerMiddleware);

// Define routes
app.use('/health', healthRoute);
app.use('/v/auth', authRoute);
app.use('/v/auth/2fa', totpRoute);
app.use('/v/auth/sessions', sessionRoute);
app.use('/v', vaultRoute);
app.use('/v/folders', folderRoute);
app.use('/v/api/settings', settingsRoute);
app.use('/v/share', shareRoute);
app.use('/v/pricing', pricingRoute);
app.use('/v/payments', paymentRoute);
app.use('/v/subscriptions', subscriptionRoute);
app.use('/v/geo', geoRoute);
app.use('/v/onboarding', onboardingRoute);
app.use('/v/account', accountRoute);
app.use('/v/workspaces', workspaceRoute);
app.use('/v/billing', billingRoute);
app.use('/v/admin/activity-logs', activityLogRoutes);
app.use('/v/admin/access', accessManagementRoutes);
app.use('/v/invitations', invitationRoute);
// UI routes - accept user JWTs from browser
app.use('/v/secrets', secretsUIRoute);
// Machine API routes - only accept PAT/Service Account (reject user JWTs)
app.use('/api/v1/secrets', secretsAPIRoute);
app.use('/v/pats', patRoute);
app.use('/v/service-accounts', serviceAccountRoute);

// Establish database connection at server startup
const initializeDatabase = async () => {
  try {
    new Database(DBCONFIG.vault.databaseName);
  } catch (error) {
    logger.error(`Error establishing database connection: ${error}`);
    process.exit(1); // Exit the process if the database connection fails
  }
};

export const startServer = async () => {
  await initializeDatabase(); // Ensure database connection is established before starting the server

  // Log SMTP configuration status at startup
  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
  logger.info({
    smtpConfigured,
    smtpHost: process.env.SMTP_HOST || 'NOT SET (default: smtp.gmail.com)',
    smtpPort: process.env.SMTP_PORT || 'NOT SET (default: 587)',
    smtpSecure: process.env.SMTP_SECURE || 'NOT SET',
    smtpUser: process.env.SMTP_USER ? '***configured***' : 'NOT SET',
    smtpPassword: process.env.SMTP_PASSWORD ? '***configured***' : 'NOT SET',
    smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || 'NOT SET',
    frontendUrl: process.env.FRONTEND_URL || 'NOT SET (default: http://localhost:3063)',
    authAppUrl: process.env.AUTH_APP_URL || process.env.START_URL || 'NOT SET (default: http://localhost:3061, prod: https://start.novasafe.io)',
  }, 'SMTP Configuration Status at Startup');

  if (!smtpConfigured) {
    logger.warn('⚠️  SMTP is not configured. Email sending (invitations, OTPs) will be disabled.');
    logger.warn('   Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in your .env file.');
  } else {
    logger.info('✅ SMTP is configured. Email sending is enabled.');
  }

  app.listen(Number(PORT), BIND_HOST, () => {
    logger.info('#'.repeat(50));
    logger.info(`Vault service running on port ${PORT} (bind: ${BIND_HOST})`);
    logger.info(`Internal access: http://localhost:${PORT}`);
    if (BIND_HOST === '0.0.0.0') {
      logger.info(`External access: http://0.0.0.0:${PORT}`);
    }
    logger.info('#'.repeat(50));

    // Run expired subscription check every hour (trial/period ended → status = expired)
    const EXPIRED_CHECK_MS = 60 * 60 * 1000;
    setInterval(async () => {
      try {
        const { checkExpiredSubscriptions } = await import('./services/subscriptionService');
        const count = await checkExpiredSubscriptions();
        if (count > 0) logger.info({ expiredCount: count }, 'Marked expired subscriptions');
      } catch (err: any) {
        logger.warn({ error: err?.message }, 'checkExpiredSubscriptions failed');
      }
    }, EXPIRED_CHECK_MS);
  });
};