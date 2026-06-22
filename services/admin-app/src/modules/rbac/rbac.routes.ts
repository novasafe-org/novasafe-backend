import { Router } from 'express';

import {
  acceptInvite,
  authMiddleware,
  changePassword,
  createInvite,
  getInviteByToken,
  getRolePermissions,
  listRolePermissionMatrix,
  loginAdmin,
  requestPasswordReset,
  requirePermission,
  resetPasswordWithToken,
  updateRolePermission,
} from './rbac.service';
import type { AdminRoleKey, PermissionAction, PermissionKey } from './rbac.types';
import { ADMIN_COLLECTIONS, getDb } from '../../database/mongo';

export function createRbacRoutes(): Router {
  const router = Router();

  router.post('/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        res.status(400).json({ success: false, message: 'email and password are required' });
        return;
      }
      const data = await loginAdmin(String(email), String(password));
      res.json({ success: true, data });
    } catch (err) {
      res.status(401).json({ success: false, message: err instanceof Error ? err.message : 'Login failed' });
    }
  });

  router.get('/auth/me', authMiddleware, async (req, res, next) => {
    try {
      const permissions = await getRolePermissions(req.admin!.roleKey);
      res.json({ success: true, data: { user: req.admin, permissions } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/change-password', authMiddleware, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
        return;
      }
      await changePassword(req.admin!.id, String(currentPassword), String(newPassword));
      res.json({ success: true, message: 'Password updated' });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Update failed' });
    }
  });

  router.post('/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email) {
        res.status(400).json({ success: false, message: 'email is required' });
        return;
      }
      const data = await requestPasswordReset(String(email));
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Request failed' });
    }
  });

  router.post('/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body ?? {};
      if (!token || !password) {
        res.status(400).json({ success: false, message: 'token and password are required' });
        return;
      }
      await resetPasswordWithToken(String(token), String(password));
      res.json({ success: true, message: 'Password reset successful' });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Reset failed' });
    }
  });

  router.get('/auth/invite/:token', async (req, res) => {
    try {
      const data = await getInviteByToken(req.params.token);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Invalid invite' });
    }
  });

  router.post('/auth/accept-invite', async (req, res) => {
    try {
      const { token, name, password } = req.body ?? {};
      if (!token || !password) {
        res.status(400).json({ success: false, message: 'token and password are required' });
        return;
      }
      const data = await acceptInvite({
        token: String(token),
        name: String(name || ''),
        password: String(password),
      });
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Accept failed' });
    }
  });

  router.get('/rbac/matrix', authMiddleware, requirePermission('rbac.manage', 'read'), async (_req, res, next) => {
    try {
      const data = await listRolePermissionMatrix();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/rbac/matrix/:roleKey/:permissionKey', authMiddleware, requirePermission('rbac.manage', 'manage'), async (req, res, next) => {
    try {
      const { roleKey, permissionKey } = req.params;
      const { action } = req.body ?? {};
      if (!['manage', 'read', 'none'].includes(action)) {
        res.status(400).json({ success: false, message: 'Invalid action' });
        return;
      }
      await updateRolePermission(
        roleKey as AdminRoleKey,
        permissionKey as PermissionKey,
        action as PermissionAction,
        req.admin!.roleKey,
      );
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Update failed' });
    }
  });

  router.get('/team/members', authMiddleware, requirePermission('settings.manage', 'read'), async (_req, res, next) => {
    try {
      const users = await getDb()
        .collection(ADMIN_COLLECTIONS.users)
        .find({}, { projection: { passwordHash: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, data: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.roleKey,
        status: u.status,
        lastLogin: u.lastLoginAt?.toISOString() ?? null,
      })) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/team/invites', authMiddleware, requirePermission('settings.manage', 'manage'), async (req, res, next) => {
    try {
      const { email, roleKey } = req.body ?? {};
      if (!email || !roleKey) {
        res.status(400).json({ success: false, message: 'email and roleKey are required' });
        return;
      }
      const data = await createInvite({
        email: String(email),
        roleKey: roleKey as AdminRoleKey,
        invitedBy: req.admin!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
