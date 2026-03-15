/**
 * Access Management Routes
 * 
 * API routes for access management operations
 * All routes require admin authentication
 */

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { loadRBACContext, requirePermission } from '../../middlewares/rbac';
import { Permission } from '../../constants/rbac.constants';
import {
  getUsersController,
  updateUserRoleController,
  updateUserStatusController,
  createInvitationController,
  getInvitationsController,
  resendInvitationController,
  revokeInvitationController,
  getSharedVaultsController,
  stopSharingVaultController,
  getAccessRequestsController,
  approveAccessRequestController,
  rejectAccessRequestController,
} from '../../controllers/AccessManagementController';

const router = Router();

// All routes: auth, then RBAC context (workspace), then admin check
router.use(authMiddleware);
router.use(loadRBACContext);
router.use(adminAuthMiddleware);

// User management routes
router.get('/users', requirePermission(Permission.USERS_VIEW), getUsersController);
router.patch('/users/:userId/role', requirePermission(Permission.USERS_UPDATE_ROLE), updateUserRoleController);
router.patch('/users/:userId/status', requirePermission(Permission.USERS_SUSPEND), updateUserStatusController);

// Invitation routes
router.post('/invitations', requirePermission(Permission.USERS_INVITE), createInvitationController);
router.get('/invitations', requirePermission(Permission.USERS_VIEW), getInvitationsController);
router.post('/invitations/:invitationId/resend', requirePermission(Permission.USERS_INVITE), resendInvitationController);
router.delete('/invitations/:invitationId', requirePermission(Permission.USERS_REVOKE), revokeInvitationController);

// Shared vaults routes
router.get('/shared-vaults', requirePermission(Permission.SHARE_VIEW), getSharedVaultsController);
router.delete('/shared-vaults/:vaultId', requirePermission(Permission.SHARE_MANAGE), stopSharingVaultController);

// Access requests routes
router.get('/access-requests', requirePermission(Permission.SHARE_VIEW), getAccessRequestsController);
router.post('/access-requests/:requestId/approve', requirePermission(Permission.SHARE_MANAGE), approveAccessRequestController);
router.post('/access-requests/:requestId/reject', requirePermission(Permission.SHARE_MANAGE), rejectAccessRequestController);

export default router;

