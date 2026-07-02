import { Router } from 'express';

import { authMiddleware, requirePermission } from '../rbac/rbac.service';
import {
  bulkUpdateFeatureFlags,
  getFeatureFlagRowsByKey,
  getFeatureFlagSnapshot,
  listFeatureFlagAudit,
  listFeatureFlagRows,
  toggleFeatureFlag,
} from './feature-flags.service';

export function createFeatureFlagRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(requirePermission('flags.read', 'read'));

  router.get('/', async (req, res, next) => {
    try {
      const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;
      const rows = await listFeatureFlagRows(environment);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/snapshot', async (req, res, next) => {
    try {
      const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;
      const snapshot = await getFeatureFlagSnapshot(environment);
      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:key/history', async (req, res, next) => {
    try {
      const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const history = await listFeatureFlagAudit(req.params.key, environment, limit);
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:key', async (req, res, next) => {
    try {
      const rows = await getFeatureFlagRowsByKey(req.params.key);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:key', requirePermission('flags.manage', 'manage'), async (req, res, next) => {
    try {
      if (!req.admin) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const body = req.body ?? {};
      const enabled = Boolean(body.enabled);
      const environment = String(body.environment ?? 'production');
      const row = await toggleFeatureFlag({
        key: req.params.key,
        environment,
        enabled,
        actorId: req.admin.id,
        actorEmail: req.admin.email,
      });
      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  });

  router.put('/', requirePermission('flags.manage', 'manage'), async (req, res, next) => {
    try {
      if (!req.admin) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const body = req.body ?? {};
      const environment = String(body.environment ?? 'production');
      const flags = (body.flags ?? {}) as Record<string, boolean>;
      const snapshot = await bulkUpdateFeatureFlags({
        environment,
        flags,
        actorId: req.admin.id,
        actorEmail: req.admin.email,
      });
      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
