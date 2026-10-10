import { Router } from 'express';
import { z } from 'zod';

import { authMiddleware, requirePermission } from '../rbac/rbac.service';
import type { PermissionAction, PermissionKey } from '../rbac/rbac.types';
import {
  createApiToken,
  createServiceAccount,
  deleteServiceAccount,
  getServiceAccountById,
  listApiTokens,
  listServiceAccounts,
  revokeApiToken,
  updateServiceAccount,
} from './service-accounts.service';

const permissionGrantSchema = z.object({
  permissionKey: z.string(),
  action: z.enum(['manage', 'read', 'none']),
});

const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissions: z.array(permissionGrantSchema).min(1),
  defaultAuthor: z
    .object({
      id: z.string().min(1).max(128),
      name: z.string().min(1).max(120),
      email: z.string().email().optional(),
    })
    .optional(),
});

const updateAccountSchema = createAccountSchema.partial().extend({
  status: z.enum(['active', 'disabled']).optional(),
  defaultAuthor: z
    .object({
      id: z.string().min(1).max(128),
      name: z.string().min(1).max(120),
      email: z.string().email().optional(),
    })
    .nullable()
    .optional(),
});

const createTokenSchema = z.object({
  name: z.string().min(1).max(120),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export function createServiceAccountRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(requirePermission('integrations.manage', 'manage'));

  router.get('/', async (_req, res, next) => {
    try {
      const items = await listServiceAccounts();
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = createAccountSchema.parse(req.body ?? {});
      const created = await createServiceAccount({
        name: body.name,
        description: body.description,
        permissions: body.permissions as Array<{ permissionKey: PermissionKey; action: PermissionAction }>,
        defaultAuthor: body.defaultAuthor
          ? { id: body.defaultAuthor.id, name: body.defaultAuthor.name, email: body.defaultAuthor.email }
          : undefined,
        createdBy: req.admin!.id,
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const account = await getServiceAccountById(req.params.id);
      if (!account) {
        res.status(404).json({ success: false, message: 'Service account not found' });
        return;
      }
      res.json({ success: true, data: account });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const body = updateAccountSchema.parse(req.body ?? {});
      const updated = await updateServiceAccount(req.params.id, {
        name: body.name,
        description: body.description,
        status: body.status,
        permissions: body.permissions as Array<{ permissionKey: PermissionKey; action: PermissionAction }> | undefined,
        defaultAuthor:
          body.defaultAuthor === null
            ? null
            : body.defaultAuthor
              ? { id: body.defaultAuthor.id, name: body.defaultAuthor.name, email: body.defaultAuthor.email }
              : undefined,
      });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Service account not found' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const ok = await deleteServiceAccount(req.params.id);
      if (!ok) {
        res.status(404).json({ success: false, message: 'Service account not found' });
        return;
      }
      res.json({ success: true, message: 'Service account disabled' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/tokens', async (req, res, next) => {
    try {
      const account = await getServiceAccountById(req.params.id);
      if (!account) {
        res.status(404).json({ success: false, message: 'Service account not found' });
        return;
      }
      const items = await listApiTokens(req.params.id);
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/tokens', async (req, res, next) => {
    try {
      const body = createTokenSchema.parse(req.body ?? {});
      const result = await createApiToken({
        serviceAccountId: req.params.id,
        name: body.name,
        expiresInDays: body.expiresInDays,
        createdBy: req.admin!.id,
      });
      if (!result) {
        res.status(404).json({ success: false, message: 'Service account not found or inactive' });
        return;
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/:id/tokens/:tokenId/revoke', async (req, res, next) => {
    try {
      const ok = await revokeApiToken(req.params.id, req.params.tokenId);
      if (!ok) {
        res.status(404).json({ success: false, message: 'Token not found' });
        return;
      }
      res.json({ success: true, message: 'Token revoked' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
