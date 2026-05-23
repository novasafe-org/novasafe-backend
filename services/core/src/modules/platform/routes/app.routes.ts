import { Router } from 'express';

/** Public app version manifest (no auth) — mobile in-app update checks. */
export const createAppRoutes = (): Router => {
  const router = Router();

  router.get('/version', (_req, res) => {
    const latestVersion =
      process.env.MOBILE_APP_LATEST_VERSION?.trim() ||
      process.env.APP_LATEST_VERSION?.trim() ||
      '0.0.0';
    res.status(200).json({
      latestVersion,
      forceUpdate: process.env.MOBILE_APP_FORCE_UPDATE === 'true',
      message: process.env.MOBILE_APP_UPDATE_MESSAGE?.trim() || 'New features available',
    });
  });

  return router;
};
