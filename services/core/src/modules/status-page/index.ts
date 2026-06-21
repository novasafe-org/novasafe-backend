import type { Express } from 'express';

import {
  createStatusPageAdminRoutes,
  createStatusPagePublicRoutes,
} from './routes/status-page.routes';

export const STATUS_PAGE_PUBLIC_PATH = '/status';
export const STATUS_PAGE_ADMIN_PATH = '/admin/status';

/**
 * Public status page API + admin management routes.
 * Public: GET /status, /status/services, /status/incidents, …
 * Admin: POST/PUT /admin/status/… (STATUS_PAGE_ADMIN_SECRET or JWT when secret unset)
 */
export const registerStatusPageModule = (app: Express, apiPrefix: string): void => {
  app.use(STATUS_PAGE_PUBLIC_PATH, createStatusPagePublicRoutes());
  app.use(STATUS_PAGE_ADMIN_PATH, createStatusPageAdminRoutes());

  /** Versioned mirrors for API consistency */
  app.use(`${apiPrefix}/status`, createStatusPagePublicRoutes());
  app.use(`${apiPrefix}/admin/status`, createStatusPageAdminRoutes());
};

export { ensureStatusPageReady } from './services/service-status.service';
