import { Router } from 'express';

/** Placeholder routes for future admin modules (templates from UI screenshots). */
export function createTemplateRoutes(): Router {
  const router = Router();

  const stub = (feature: string) => (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({
      success: true,
      data: [],
      meta: { feature, status: 'coming_soon', message: `${feature} module is not implemented yet.` },
    });
  };

  router.get('/users', stub('users'));
  router.get('/subscriptions', stub('subscriptions'));
  router.get('/devices', stub('devices'));
  router.get('/support/tickets', stub('support'));
  router.get('/security/events', stub('security'));
  router.get('/audit/logs', stub('audit'));
  router.get('/analytics/overview', stub('analytics'));
  router.get('/announcements', stub('announcements'));
  router.get('/docs', stub('docs'));
  router.get('/settings/workspace', stub('settings'));

  return router;
}
