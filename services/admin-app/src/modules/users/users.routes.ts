import { Router } from 'express';

import { authMiddleware, requirePermission } from '../rbac/rbac.service';
import { getCustomerById, listCustomers } from './customers.service';

export function createUsersRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(requirePermission('users.read', 'read'));

  router.get('/', async (req, res, next) => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await listCustomers({
        page: Number.isFinite(page) ? page : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        plan: typeof req.query.plan === 'string' ? req.query.plan : undefined,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const user = await getCustomerById(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
