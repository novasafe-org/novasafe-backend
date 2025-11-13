/**
 * Share Routes
 * 
 * Defines routes for sharing vault items and folders.
 */

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
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

// Share operations
router.post('/create', createShareController);
router.get('/list', (req, res) => {
  // Route to appropriate controller based on query parameter
  if (req.query.type === 'sent') {
    return getSentSharesController(req, res);
  }
  return getReceivedSharesController(req, res);
});
router.post('/revoke', revokeShareController);
router.patch('/update', updateSharePermissionController);

// Public key operations
router.get('/keys/public', getPublicKeyController);
router.post('/keys/public', savePublicKeyController);

export default router;

