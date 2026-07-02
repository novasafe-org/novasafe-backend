import { Router } from 'express';

import { authMiddleware } from '../../../modules/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.middleware';
import { mergeCapabilities } from '../../../shared/request-context/capabilities/platform-capabilities';
import { getRequestContext, RequestContextManager } from '../../../shared/request-context';
import { buildFeatureFlagEtag, resolveClientFeatureFlags } from '../../../platform/feature-flags/store';

const featureFlagsRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyFn: (req) => `feature-flags:${req.user?.id ?? req.ip ?? 'anonymous'}`,
  message: 'Too many feature flag requests. Try again shortly.',
});

export const createPlatformFeatureFlagRoutes = (): Router => {
  const router = Router();

  router.get(
    '/feature-flags',
    authMiddleware,
    featureFlagsRateLimiter,
    async (req, res, next) => {
      try {
        const environment =
          typeof req.query.environment === 'string' ? req.query.environment : undefined;
        const snapshot = await resolveClientFeatureFlags(environment);
        const context = getRequestContext();
        const baseCapabilities = context?.snapshot.capabilities ?? [];
        const capabilities = mergeCapabilities(baseCapabilities, snapshot.flags);

        RequestContextManager.enrichFlags(snapshot.flags);

        const data = {
          version: snapshot.catalogVersion,
          storeVersion: snapshot.storeVersion,
          environment: snapshot.environment,
          flags: snapshot.flags,
          capabilities,
        };

        const etag = buildFeatureFlagEtag(snapshot);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=60');

        if (req.headers['if-none-match'] === etag) {
          res.status(304).end();
          return;
        }

        res.status(200).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
};
