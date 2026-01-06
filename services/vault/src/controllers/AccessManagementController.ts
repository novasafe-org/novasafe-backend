/**
 * Access Management Controller
 * 
 * Handles HTTP requests for access management operations
 */

import { Request, Response } from 'express';
import '../middlewares/auth'; // Ensure Request type extension
import {
  getOrganizationUsers,
  updateUserRole,
  updateUserStatus,
  createInvitation,
  createMultipleInvitations,
  getOrganizationInvitations,
  resendInvitation,
  revokeInvitation,
  getSharedVaults,
  stopSharingVault,
  getAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  getInvitationByToken,
  acceptInvitation,
} from '../services/accessManagementService';
import { logActivity } from '../utils/activityLogHelper';
import { addUserPermissionsToResponse } from '../utils/responseHelper';
import logger from '../logger';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ObjectId } from 'mongodb';

const collection = DBCONFIG.vault.collections;

/**
 * Get all users in organization
 * GET /admin/access/users
 */
export const getUsersController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const users = await getOrganizationUsers(adminContext.organizationId, userId);

    // Transform users for frontend
    const transformedUsers = users.map((user: any) => ({
      id: user._id?.toString() || '',
      email: user.email,
      name: user.name,
      avatar: user.picture,
      role: (user.role || 'member').toLowerCase(),
      status: user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date() ? 'suspended' : 'active',
      accessScope: {
        vaults: 0, // TODO: Calculate from shares
        items: 0, // TODO: Calculate from shares
      },
      joinedAt: user.createdAt?.toISOString() || new Date().toISOString(),
      lastActive: user.updatedAt?.toISOString(),
    }));

    // Include user permissions in response
    const response = addUserPermissionsToResponse(req, {
      success: true,
      data: transformedUsers,
    });
    
    res.status(200).json(response);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get users');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};

/**
 * Update user role
 * PATCH /admin/access/users/:userId/role
 */
export const updateUserRoleController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { userId: targetUserId } = req.params;
    const { role } = req.body;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Invalid role',
        error: 'Role must be admin, member, or viewer',
      });
      return;
    }

    await updateUserRole(userId, targetUserId, role, adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update user role');
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message,
    });
  }
};

/**
 * Update user status (suspend/activate)
 * PATCH /admin/access/users/:userId/status
 */
export const updateUserStatusController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { userId: targetUserId } = req.params;
    const { status } = req.body;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status',
        error: 'Status must be active or suspended',
      });
      return;
    }

    await updateUserStatus(userId, targetUserId, status, adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully`,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update user status');
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message,
    });
  }
};

/**
 * Create invitation(s)
 * POST /admin/access/invitations
 * Supports both single email (string) and multiple emails (string[])
 */
export const createInvitationController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { email, emails, role, vaultIds } = req.body;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    // Support both single email and multiple emails
    const emailList: string[] = emails || (email ? [email] : []);

    if (!emailList.length || !role) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields',
        error: 'Email(s) and role are required',
      });
      return;
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Invalid role',
        error: 'Role must be admin, member, or viewer',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(e => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid email format',
        error: `Invalid emails: ${invalidEmails.join(', ')}`,
      });
      return;
    }

    // Create invitations for all emails
    const results = await createMultipleInvitations(
      userId,
      emailList,
      role,
      vaultIds || [],
      adminContext.organizationId
    );

    // Transform successful invitations
    const successfulInvitations = results.success.map(inv => ({
      id: inv._id?.toString(),
      email: inv.email,
      role: inv.role,
      vaults: inv.vaultIds.map(id => id.toString()),
      status: inv.status,
      invitedAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      invitedBy: inv.invitedBy.toString(),
    }));

    res.status(201).json({
      success: true,
      data: {
        invitations: successfulInvitations,
        successCount: results.success.length,
        failedCount: results.failed.length,
        failed: results.failed,
      },
      message: results.failed.length > 0
        ? `Created ${results.success.length} invitation(s), ${results.failed.length} failed`
        : `Successfully created ${results.success.length} invitation(s)`,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create invitations');
    res.status(500).json({
      success: false,
      message: 'Failed to create invitations',
      error: error.message,
    });
  }
};

/**
 * Get all invitations
 * GET /admin/access/invitations
 */
export const getInvitationsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const invitations = await getOrganizationInvitations(userId, adminContext.organizationId);

    // Transform invitations for frontend
    const transformedInvitations = invitations.map((inv: any) => ({
      id: inv._id?.toString() || '',
      email: inv.email,
      role: inv.role,
      vaults: inv.vaultIds.map((id: any) => id.toString()),
      status: inv.status,
      invitedAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      invitedBy: inv.invitedBy.toString(),
    }));

    res.status(200).json({
      success: true,
      data: transformedInvitations,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get invitations');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitations',
      error: error.message,
    });
  }
};

/**
 * Resend invitation
 * POST /admin/access/invitations/:invitationId/resend
 */
export const resendInvitationController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { invitationId } = req.params;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const invitation = await resendInvitation(userId, invitationId, adminContext.organizationId);

    res.status(200).json({
      success: true,
      data: {
        id: invitation._id?.toString(),
        email: invitation.email,
        role: invitation.role,
        vaults: invitation.vaultIds.map(id => id.toString()),
        status: invitation.status,
        invitedAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        invitedBy: invitation.invitedBy.toString(),
      },
      message: 'Invitation resent successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to resend invitation');
    res.status(500).json({
      success: false,
      message: 'Failed to resend invitation',
      error: error.message,
    });
  }
};

/**
 * Revoke invitation
 * DELETE /admin/access/invitations/:invitationId
 */
export const revokeInvitationController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { invitationId } = req.params;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    await revokeInvitation(userId, invitationId, adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: 'Invitation revoked successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to revoke invitation');
    res.status(500).json({
      success: false,
      message: 'Failed to revoke invitation',
      error: error.message,
    });
  }
};

/**
 * Get shared vaults
 * GET /admin/access/shared-vaults
 */
export const getSharedVaultsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const sharedVaults = await getSharedVaults(userId, adminContext.organizationId);

    res.status(200).json({
      success: true,
      data: sharedVaults,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get shared vaults');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shared vaults',
      error: error.message,
    });
  }
};

/**
 * Stop sharing vault
 * DELETE /admin/access/shared-vaults/:vaultId
 */
export const stopSharingVaultController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { vaultId } = req.params;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    await stopSharingVault(userId, vaultId, adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: 'Vault sharing stopped successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to stop sharing vault');
    res.status(500).json({
      success: false,
      message: 'Failed to stop sharing vault',
      error: error.message,
    });
  }
};

/**
 * Get access requests
 * GET /admin/access/access-requests
 */
export const getAccessRequestsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    const requests = await getAccessRequests(userId, adminContext.organizationId);

    // Transform requests for frontend
    const transformedRequests = await Promise.all(requests.map(async (req: any) => {
      // Get user details
      const db = new Database('vault');
      const user = await db.findOne(collection.vaultUsers, {
        _id: new ObjectId(req.userId),
      }) as any;

      return {
        id: req._id?.toString() || '',
        userId: req.userId.toString(),
        userName: user?.name || 'Unknown',
        userEmail: user?.email || 'Unknown',
        requestedScope: req.scope,
        requestedScopeId: req.resourceId.toString(),
        requestedLevel: req.requestedLevel,
        requestedAt: req.requestedAt,
        status: req.status,
        reviewedBy: req.reviewedBy?.toString(),
        reviewedAt: req.reviewedAt,
        reason: req.reason,
      };
    }));

    res.status(200).json({
      success: true,
      data: transformedRequests,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get access requests');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access requests',
      error: error.message,
    });
  }
};

/**
 * Approve access request
 * POST /admin/access/access-requests/:requestId/approve
 */
export const approveAccessRequestController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { requestId } = req.params;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    await approveAccessRequest(userId, requestId, adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: 'Access request approved successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to approve access request');
    res.status(500).json({
      success: false,
      message: 'Failed to approve access request',
      error: error.message,
    });
  }
};

/**
 * Reject access request
 * POST /admin/access/access-requests/:requestId/reject
 */
export const rejectAccessRequestController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const adminContext = (req as any).adminContext;
    const { requestId } = req.params;
    const { reviewComment } = req.body;

    if (!userId || !adminContext) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required',
      });
      return;
    }

    await rejectAccessRequest(userId, requestId, reviewComment || '', adminContext.organizationId);

    res.status(200).json({
      success: true,
      message: 'Access request rejected successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to reject access request');
    res.status(500).json({
      success: false,
      message: 'Failed to reject access request',
      error: error.message,
    });
  }
};

/**
 * Get invitation by token (public endpoint - no auth required)
 * GET /invitations/verify/:token
 */
export const getInvitationByTokenController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Invitation token is required',
      });
      return;
    }

    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: 'Invalid or expired invitation token',
        userMessage: 'This invitation link is invalid or has expired. Please contact your administrator for a new invitation.',
      });
      return;
    }

    // Return invitation details (without sensitive info)
    res.status(200).json({
      success: true,
      message: 'Invitation found',
      data: {
        email: invitation.email,
        role: invitation.role,
        organizationId: invitation.organizationId,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get invitation by token');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to verify invitation',
    });
  }
};

/**
 * Accept invitation and create account (public endpoint - no auth required)
 * POST /invitations/accept
 */
export const acceptInvitationController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token: invitationToken, name, password, signupMethod, googleId, picture } = req.body;

    if (!invitationToken) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Invitation token is required',
      });
      return;
    }

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Name is required',
      });
      return;
    }

    if (signupMethod === 'email' && !password) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Password is required for email signup',
      });
      return;
    }

    const result = await acceptInvitation(invitationToken, {
      name,
      password: password || '',
      signupMethod: signupMethod || 'email',
      googleId,
      picture,
    });

    // Generate JWT token for the new user
    const { generateToken } = await import('../utils/generateToken');
    const { token, tokenId } = generateToken(result.user);

    res.status(200).json({
      success: true,
      message: 'Invitation accepted and account created successfully',
      data: {
        user: {
          id: result.user._id!.toString(),
          email: result.user.email,
          name: result.user.name,
          role: (result.user as any).role,
          planId: result.user.planId,
          companyName: result.user.companyName,
          onboardingCompleted: result.user.onboardingCompleted,
        },
        token: token,
        invitation: {
          role: result.invitation.role,
          organizationId: result.invitation.organizationId,
        },
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to accept invitation');
    
    // Handle specific error cases
    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        message: 'Conflict',
        error: error.message,
        userMessage: 'An account with this email already exists. Please log in instead.',
      });
      return;
    }

    if (error.message.includes('Invalid or expired')) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: error.message,
        userMessage: 'This invitation link is invalid or has expired. Please contact your administrator for a new invitation.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to accept invitation',
    });
  }
};

