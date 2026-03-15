/**
 * Account Routes
 * 
 * BASE PATH: /v/account
 */

import express from 'express';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext } from '../middlewares/rbac';
import { getAccountDetails, updateAccountDisplayName } from '../controllers/AccountController';

const router = express.Router();

/**
 * @route   GET /v/account
 * @desc    Get current user's account details (workspace-scoped when X-Workspace-Id is sent)
 * @access  Protected
 */
router.get('/', authMiddleware, loadRBACContext, getAccountDetails);

/**
 * @route   PATCH /v/account
 * @desc    Update workspace-scoped display name (requires X-Workspace-Id)
 * @access  Protected
 */
router.patch('/', authMiddleware, loadRBACContext, updateAccountDisplayName);

export default router;

