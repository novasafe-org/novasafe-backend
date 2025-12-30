/**
 * Activity Log Routes (Admin Only)
 * 
 * Defines routes for activity log operations.
 * All routes require admin authentication and Team/Business plan.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { loadRBACContext, requirePermission } from '../../middlewares/rbac';
import { Permission } from '../../constants/rbac.constants';
import {
  getActivityLogs,
  getActivityLogById,
  exportActivityLogs,
} from '../../controllers/admin/ActivityLogController';

const router = Router();

/**
 * GET /admin/activity-logs
 * Get activity logs with filtering and pagination
 * Requires: logs:read permission
 */
router.get(
  '/',
  authMiddleware,
  adminAuthMiddleware,
  loadRBACContext,
  requirePermission(Permission.LOGS_READ),
  getActivityLogs
);

/**
 * GET /admin/activity-logs/:id
 * Get a single activity log by ID
 * Requires: logs:read permission
 */
router.get(
  '/:id',
  authMiddleware,
  adminAuthMiddleware,
  loadRBACContext,
  requirePermission(Permission.LOGS_READ),
  getActivityLogById
);

/**
 * GET /admin/activity-logs/export
 * Export activity logs (CSV/JSON)
 * Requires: logs:export permission
 */
router.get(
  '/export',
  authMiddleware,
  adminAuthMiddleware,
  loadRBACContext,
  requirePermission(Permission.LOGS_EXPORT),
  exportActivityLogs
);

export default router;

