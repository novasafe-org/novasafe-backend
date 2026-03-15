/**
 * Workspace routes: list workspaces for the current user (for workspace switching).
 */
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext } from '../middlewares/rbac';
import { getWorkspaceIdsForUser, getWorkspaceById } from '../services/workspaceService';
import { getUserRole } from '../services/rbacService';

const router = Router();

router.get(
  '/',
  authMiddleware,
  loadRBACContext,
  async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const ids = await getWorkspaceIdsForUser(userId);
      const workspaces: { id: string; name: string; type: string; role: string }[] = [];
      for (const id of ids) {
        const ws = await getWorkspaceById(id);
        if (ws) {
          const role = await getUserRole(userId, id);
          workspaces.push({
            id: ws._id!.toString(),
            name: ws.name,
            type: ws.type,
            role,
          });
        }
      }
      res.json({ success: true, workspaces });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || 'Failed to list workspaces' });
    }
  }
);

export default router;
