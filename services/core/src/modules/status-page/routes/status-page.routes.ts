import { Router } from 'express';

import {
  getStatusHistory,
  getStatusIncidentBySlug,
  getStatusIncidents,
  getStatusOverview,
  getStatusServices,
  postAdminIncident,
  postAdminResolveIncident,
  postAdminService,
  putAdminIncident,
} from '../controllers/status-page.controller';
import { statusAdminMiddleware } from '../middleware/status-admin.middleware';

export const createStatusPagePublicRoutes = (): Router => {
  const router = Router();

  router.get('/', getStatusOverview);
  router.get('/services', getStatusServices);
  router.get('/incidents', getStatusIncidents);
  router.get('/incidents/:slug', getStatusIncidentBySlug);
  router.get('/history', getStatusHistory);

  return router;
};

export const createStatusPageAdminRoutes = (): Router => {
  const router = Router();

  router.use(statusAdminMiddleware);

  router.post('/services', postAdminService);
  router.post('/incidents', postAdminIncident);
  router.put('/incidents/:id', putAdminIncident);
  router.post('/incidents/:id/resolve', postAdminResolveIncident);

  return router;
};
