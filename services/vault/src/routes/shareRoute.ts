/**
 * Share Routes
 * 
 * Defines routes for sharing vault items and folders.
 */

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';
import {
  createShareController,
  getReceivedSharesController,
  getSentSharesController,
  revokeShareController,
  updateSharePermissionController,
  getPublicKeyController,
  savePublicKeyController,
} from '../controllers/ShareController';

const router = Router();

// All routes require authentication
router.use(authMiddleware);
router.use(loadRBACContext);

// Share operations
router.post('/create', requirePermission(Permission.SHARE_MANAGE), createShareController);
router.get('/list', requirePermission(Permission.SHARE_VIEW), (req, res) => {
  // Route to appropriate controller based on query parameter
  if (req.query.type === 'sent') {
    return getSentSharesController(req, res);
  }
  return getReceivedSharesController(req, res);
});
router.post('/revoke', requirePermission(Permission.SHARE_MANAGE), revokeShareController);
router.patch('/update', requirePermission(Permission.SHARE_MANAGE), updateSharePermissionController);

// Public key operations
router.get('/keys/public', getPublicKeyController);
router.post('/keys/public', savePublicKeyController);

export default router;

