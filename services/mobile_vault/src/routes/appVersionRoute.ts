import { Router } from 'express';

const router = Router();

/**
 * Public version manifest for in-app update checks (no auth).
 * Configure via env on your deployment.
 */
router.get('/version', (_req, res) => {
  const latestVersion =
    process.env.MOBILE_APP_LATEST_VERSION?.trim() || process.env.APP_LATEST_VERSION?.trim() || '0.0.0';
  res.status(200).json({
    latestVersion,
    forceUpdate: process.env.MOBILE_APP_FORCE_UPDATE === 'true',
    message: process.env.MOBILE_APP_UPDATE_MESSAGE?.trim() || 'New features available',
  });
});

export default router;
