import { Router, type NextFunction, type Request, type Response } from 'express';

import { authMiddleware } from '../../../modules/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.middleware';
import { mergeCapabilities } from '../../../shared/request-context/capabilities/platform-capabilities';
import { getRequestContext, RequestContextManager } from '../../../shared/request-context';
import { getFeatureFlagMetrics } from '../../../platform/feature-flags/metrics';
import { buildFeatureFlagEtag, resolveClientFeatureFlags } from '../../../platform/feature-flags/store';

const featureFlagsRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyFn: (req) => `feature-flags:${req.user?.id ?? req.ip ?? 'anonymous'}`,
  message: 'Too many feature flag requests. Try again shortly.',
});

const publicFeatureFlagsRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyFn: (req) => `feature-flags-public:${req.ip ?? 'anonymous'}`,
  message: 'Too many feature flag requests. Try again shortly.',
});

async function respondWithFeatureFlags(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const environment =
      typeof req.query.environment === 'string' ? req.query.environment : undefined;
    const { snapshot, cacheHit } = await resolveClientFeatureFlags(environment);
    const metrics = getFeatureFlagMetrics();
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
    res.setHeader('X-Feature-Flags-Cache', cacheHit ? 'HIT' : 'MISS');
    res.setHeader('X-Feature-Flags-Store-Version', String(snapshot.storeVersion));
    res.setHeader('X-Feature-Flags-Catalog-Version', snapshot.catalogVersion);
    res.setHeader('X-Feature-Flags-Cache-Hit-Rate', metrics.cacheHitRate.toFixed(3));

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export const createPlatformFeatureFlagRoutes = (): Router => {
  const router = Router();

  router.get(
    '/feature-flags/public',
    publicFeatureFlagsRateLimiter,
    async (req, res, next) => {
      await respondWithFeatureFlags(req, res, next);
    },
  );

  router.get(
    '/feature-flags',
    authMiddleware,
    featureFlagsRateLimiter,
    async (req, res, next) => {
      await respondWithFeatureFlags(req, res, next);
    },
  );

  return router;
};
