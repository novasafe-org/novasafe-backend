/**
 * Application configuration (environment-driven).
 * Database and external integrations are not wired in this scaffold.
 */

export { authConfig, assertAuthConfig } from './auth.config';

export const appConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.CORE_PORT || process.env.PORT || 3125),
  bindHost: process.env.BIND_HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',
  apiPrefix: '/api/v1',
} as const;
