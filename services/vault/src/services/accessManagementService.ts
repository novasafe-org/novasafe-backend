/**
 * Access Management Service
 * 
 * Handles all access management operations:
 * - User management (list, update role, suspend/activate)
 * - Invitations (create, list, resend, revoke)
 * - Permissions (grant, revoke, update)
 * - Shared vaults (list, stop sharing)
 * - Access requests (list, approve, reject)
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IUser } from '../models/User';
import { IInvitation, InvitationStatus } from '../models/Invitation';
import { IAccessRequest, AccessRequestStatus } from '../models/AccessRequest';
import { IShare } from '../models/Share';
import { IFolder } from '../models/Folder';
import logger from '../logger';
import crypto from 'crypto';
import { activityLogService } from './activityLogService';
import { logActivity } from '../utils/activityLogHelper';
import { sendInvitationEmail } from './emailService';

const collection = DBCONFIG.vault.collections;

/**
 * Generate a secure invitation token
 */
const generateInvitationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Get all users in an organization
 */
export const getOrganizationUsers = async (
  organizationId: string,
  userId: string
): Promise<IUser[]> => {
  try {
    const db = new Database('vault');
    
    // Verify user is admin and belongs to organization
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('User not found or not authorized');
    }

    const userRole = ((adminUser as any).role || '').toLowerCase();
    if (userRole !== 'admin' && userRole !== 'super-admin') {
      throw new Error('Only admins can view organization users');
    }

    // Get all users in the organization
    const dbInstance = db.getDb();
    const users = await dbInstance
      .collection(collection.vaultUsers)
      .find({ companyName: organizationId })
      .toArray() as IUser[];

    return users;
  } catch (error: any) {
    logger.error({ error: error.message, organizationId, userId }, 'Failed to get organization users');
    throw error;
  }
};

/**
 * Update user role
 */
export const updateUserRole = async (
  userId: string,
  targetUserId: string,
  newRole: 'admin' | 'member' | 'viewer',
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can update user roles');
    }

    // Get target user
    const targetUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(targetUserId),
      companyName: organizationId,
    }) as IUser | null;

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Prevent self-demotion if only one admin
    if (userId === targetUserId && newRole !== 'admin') {
      const dbInstance = db.getDb();
      const adminCount = await dbInstance
        .collection(collection.vaultUsers)
        .countDocuments({
          companyName: organizationId,
          role: { $in: ['admin', 'super-admin'] },
        });

      if (adminCount <= 1) {
        throw new Error('Cannot remove the last admin from organization');
      }
    }

    // Update role
    await db.updateOne(
      collection.vaultUsers,
      { _id: new ObjectId(targetUserId) },
      {
        $set: {
          role: newRole,
          updatedAt: new Date(),
        },
      }
    );

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'user',
      targetId: targetUserId,
      action: 'ROLE_CHANGED',
      description: `User role changed from ${(targetUser as any).role || 'member'} to ${newRole}`,
      metadata: {
        oldRole: (targetUser as any).role || 'member',
        newRole,
        targetUserEmail: targetUser.email,
      },
      severity: 'warning',
    });

    logger.info({ userId, targetUserId, newRole, organizationId }, 'User role updated');
  } catch (error: any) {
    logger.error({ error: error.message, userId, targetUserId, newRole }, 'Failed to update user role');
    throw error;
  }
};

/**
 * Update user status (suspend/activate)
 */
export const updateUserStatus = async (
  userId: string,
  targetUserId: string,
  status: 'active' | 'suspended',
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can update user status');
    }

    // Get target user
    const targetUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(targetUserId),
      companyName: organizationId,
    }) as IUser | null;

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Prevent suspending self
    if (userId === targetUserId) {
      throw new Error('Cannot suspend your own account');
    }

    // Update status (store in a custom field or use accountLockedUntil for suspended)
    if (status === 'suspended') {
      // Set account lock far in the future (effectively suspended)
      await db.updateOne(
        collection.vaultUsers,
        { _id: new ObjectId(targetUserId) },
        {
          $set: {
            accountLockedUntil: new Date('2099-12-31'),
            updatedAt: new Date(),
          },
        }
      );
    } else {
      // Clear account lock (activate)
      await db.updateOne(
        collection.vaultUsers,
        { _id: new ObjectId(targetUserId) },
        {
          $set: {
            accountLockedUntil: null,
            updatedAt: new Date(),
          },
        }
      );
    }

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'user',
      targetId: targetUserId,
      action: status === 'suspended' ? 'MEMBER_REMOVED' : 'MEMBER_ADDED',
      description: `User ${status === 'suspended' ? 'suspended' : 'activated'}`,
      metadata: {
        status,
        targetUserEmail: targetUser.email,
      },
      severity: status === 'suspended' ? 'warning' : 'info',
    });

    logger.info({ userId, targetUserId, status, organizationId }, 'User status updated');
  } catch (error: any) {
    logger.error({ error: error.message, userId, targetUserId, status }, 'Failed to update user status');
    throw error;
  }
};

/**
 * Create multiple invitations
 */
export const createMultipleInvitations = async (
  userId: string,
  emails: string[],
  role: 'admin' | 'member' | 'viewer',
  vaultIds: string[],
  organizationId: string
): Promise<{ success: IInvitation[]; failed: { email: string; error: string }[] }> => {
  const results = {
    success: [] as IInvitation[],
    failed: [] as { email: string; error: string }[],
  };

  // Process invitations one by one
  for (const email of emails) {
    try {
      const invitation = await createInvitation(userId, email, role, vaultIds, organizationId, true);
      results.success.push(invitation);
    } catch (error: any) {
      results.failed.push({
        email,
        error: error.message || 'Failed to create invitation',
      });
      logger.error({ error: error.message, email }, 'Failed to create invitation for email');
    }
  }

  return results;
};

/**
 * Create an invitation
 */
export const createInvitation = async (
  userId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer',
  vaultIds: string[],
  organizationId: string,
  sendEmail: boolean = true
): Promise<IInvitation> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can create invitations');
    }

    // Check if user already exists
    const existingUser = await db.findOne(collection.vaultUsers, {
      email: email.toLowerCase().trim(),
      companyName: organizationId,
    });

    if (existingUser) {
      throw new Error('User already exists in organization');
    }

    // Check for existing pending invitation
    const existingInvitation = await db.findOne(collection.invitations, {
      email: email.toLowerCase().trim(),
      organizationId,
      status: 'pending',
    });

    if (existingInvitation) {
      throw new Error('Pending invitation already exists for this email');
    }

    // Create invitation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // If no vaults specified, grant access to all vaults (empty array means all)
    const invitation: Omit<IInvitation, '_id'> = {
      email: email.toLowerCase().trim(),
      role,
      organizationId,
      invitedBy: new ObjectId(userId),
      vaultIds: vaultIds && vaultIds.length > 0 ? vaultIds.map(id => new ObjectId(id)) : [],
      status: 'pending',
      token: generateInvitationToken(),
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insertOne(collection.invitations, invitation);

    const newInvitation: IInvitation = {
      ...invitation,
      _id: result.insertedId,
    };

    // Send invitation email
    if (sendEmail) {
      try {
        const emailSent = await sendInvitationEmail(
          email,
          newInvitation.token,
          organizationId,
          role,
          adminUser.name || adminUser.email,
          expiresAt
        );
        if (!emailSent) {
          logger.warn({ email }, 'Failed to send invitation email, but invitation was created');
        }
      } catch (error: any) {
        logger.error({ error: error.message, email }, 'Error sending invitation email');
        // Don't fail the invitation creation if email fails
      }
    }

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'invitation' as const,
      targetId: result.insertedId.toString(),
      action: 'INVITATION_SENT',
      description: `Invitation sent to ${email} as ${role}`,
      metadata: {
        email,
        role,
        vaultIds,
        emailSent: sendEmail,
      },
      severity: 'info',
    });

    logger.info({ userId, email, role, organizationId }, 'Invitation created');
    return newInvitation;
  } catch (error: any) {
    logger.error({ error: error.message, userId, email, role }, 'Failed to create invitation');
    throw error;
  }
};

/**
 * Get all invitations for an organization
 */
export const getOrganizationInvitations = async (
  userId: string,
  organizationId: string
): Promise<IInvitation[]> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can view invitations');
    }

    // Get all invitations
    const dbInstance = db.getDb();
    const invitations = await dbInstance
      .collection(collection.invitations)
      .find({ organizationId })
      .toArray() as IInvitation[];

    // Check for expired invitations
    const now = new Date();
    for (const invitation of invitations) {
      if (invitation.status === 'pending' && new Date(invitation.expiresAt) < now) {
        // Mark as expired
        await db.updateOne(
          collection.invitations,
          { _id: invitation._id },
          {
            $set: {
              status: 'expired',
              updatedAt: new Date(),
            },
          }
        );
        invitation.status = 'expired';
      }
    }

    return invitations;
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to get invitations');
    throw error;
  }
};

/**
 * Resend invitation
 */
export const resendInvitation = async (
  userId: string,
  invitationId: string,
  organizationId: string
): Promise<IInvitation> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can resend invitations');
    }

    // Get invitation
    const invitation = await db.findOne(collection.invitations, {
      _id: new ObjectId(invitationId),
      organizationId,
    }) as IInvitation | null;

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      throw new Error('Can only resend pending or expired invitations');
    }

    // Update invitation with new token and expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const newToken = generateInvitationToken();

    await db.updateOne(
      collection.invitations,
      { _id: invitation._id },
      {
        $set: {
          token: newToken,
          expiresAt,
          status: 'pending',
          updatedAt: new Date(),
        },
      }
    );

    const updatedInvitation: IInvitation = {
      ...invitation,
      token: newToken,
      expiresAt,
      status: 'pending',
      updatedAt: new Date(),
    };

    // Send invitation email
    try {
      const emailSent = await sendInvitationEmail(
        invitation.email,
        updatedInvitation.token,
        organizationId,
        invitation.role,
        adminUser.name || adminUser.email,
        expiresAt
      );
      if (!emailSent) {
        logger.warn({ email: invitation.email }, 'Failed to send resend invitation email, but invitation was updated');
      }
    } catch (error: any) {
      logger.error({ error: error.message, email: invitation.email }, 'Error sending resend invitation email');
      // Don't fail the resend if email fails
    }

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'invitation' as const,
      targetId: invitationId,
      action: 'INVITATION_SENT',
      description: `Invitation resent to ${invitation.email}`,
      metadata: {
        email: invitation.email,
        role: invitation.role,
        isResend: true,
      },
      severity: 'info',
    });

    logger.info({ userId, invitationId, organizationId }, 'Invitation resent');
    return updatedInvitation;
  } catch (error: any) {
    logger.error({ error: error.message, userId, invitationId }, 'Failed to resend invitation');
    throw error;
  }
};

/**
 * Revoke invitation
 */
export const revokeInvitation = async (
  userId: string,
  invitationId: string,
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can revoke invitations');
    }

    // Get invitation
    const invitation = await db.findOne(collection.invitations, {
      _id: new ObjectId(invitationId),
      organizationId,
    }) as IInvitation | null;

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Can only revoke pending invitations');
    }

    // Update invitation
    await db.updateOne(
      collection.invitations,
      { _id: invitation._id },
      {
        $set: {
          status: 'revoked',
          revokedAt: new Date(),
          revokedBy: new ObjectId(userId),
          updatedAt: new Date(),
        },
      }
    );

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'invitation' as const,
      targetId: invitationId,
      action: 'ACCESS_REVOKED',
      description: `Invitation revoked for ${invitation.email}`,
      metadata: {
        email: invitation.email,
      },
      severity: 'warning',
    });

    logger.info({ userId, invitationId, organizationId }, 'Invitation revoked');
  } catch (error: any) {
    logger.error({ error: error.message, userId, invitationId }, 'Failed to revoke invitation');
    throw error;
  }
};

/**
 * Get shared vaults for an organization
 */
export const getSharedVaults = async (
  userId: string,
  organizationId: string
): Promise<any[]> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can view shared vaults');
    }

    // Get all users in organization
    const dbInstance = db.getDb();
    const orgUsers = await dbInstance
      .collection(collection.vaultUsers)
      .find({ companyName: organizationId })
      .toArray() as IUser[];

    const orgUserIds = orgUsers.map(u => u._id);

    // Get all shares for organization users
    const shares = await dbInstance
      .collection(collection.shares)
      .find({
        recipientId: { $in: orgUserIds },
        shareType: 'folder',
        active: true,
      })
      .toArray() as IShare[];

    // Group by vault (folder)
    const vaultMap = new Map<string, any>();

    for (const share of shares) {
      const vaultId = share.resourceId.toString();
      
      if (!vaultMap.has(vaultId)) {
        // Get folder details
        const folder = await db.findOne(collection.folders, {
          _id: new ObjectId(share.resourceId),
        }) as IFolder | null;

        if (folder) {
          // Count items in folder
          const itemCount = await dbInstance
            .collection(collection.vaultItems)
            .countDocuments({
              userId: folder.userId,
              folderId: folder._id?.toString(),
            });

          vaultMap.set(vaultId, {
            id: vaultId,
            name: folder.name,
            sharedWith: 0,
            permissionLevel: share.permission === 'edit' ? 'write' : 'read',
            lastModified: folder.updatedAt,
            sharedBy: share.sharerId.toString(),
            isOwner: share.sharerId.toString() === userId,
            itemCount,
          });
        }
      }

      const vault = vaultMap.get(vaultId);
      if (vault) {
        vault.sharedWith += 1;
      }
    }

    return Array.from(vaultMap.values());
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to get shared vaults');
    throw error;
  }
};

/**
 * Stop sharing a vault (revoke all shares)
 */
export const stopSharingVault = async (
  userId: string,
  vaultId: string,
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can stop sharing vaults');
    }

    // Verify vault exists and belongs to organization
    const folder = await db.findOne(collection.folders, {
      _id: new ObjectId(vaultId),
    }) as IFolder | null;

    if (!folder) {
      throw new Error('Vault not found');
    }

    // Get folder owner
    const folderOwner = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(folder.userId),
    }) as IUser | null;

    if (!folderOwner || folderOwner.companyName !== organizationId) {
      throw new Error('Vault does not belong to organization');
    }

    // Revoke all shares for this vault
    await db.updateMany(
      collection.shares,
      {
        resourceId: new ObjectId(vaultId),
        shareType: 'folder',
        active: true,
      },
      {
        $set: {
          active: false,
          revokedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: 'vault',
      targetId: vaultId,
      action: 'ACCESS_REVOKED',
      description: `Stopped sharing vault: ${folder.name}`,
      metadata: {
        vaultName: folder.name,
      },
      severity: 'warning',
    });

    logger.info({ userId, vaultId, organizationId }, 'Vault sharing stopped');
  } catch (error: any) {
    logger.error({ error: error.message, userId, vaultId }, 'Failed to stop sharing vault');
    throw error;
  }
};

/**
 * Get access requests for an organization
 */
export const getAccessRequests = async (
  userId: string,
  organizationId: string
): Promise<IAccessRequest[]> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can view access requests');
    }

    // Get all access requests
    const dbInstance = db.getDb();
    const requests = await dbInstance
      .collection(collection.accessRequests)
      .find({ organizationId })
      .toArray() as IAccessRequest[];

    return requests;
  } catch (error: any) {
    logger.error({ error: error.message, userId, organizationId }, 'Failed to get access requests');
    throw error;
  }
};

/**
 * Approve access request
 */
export const approveAccessRequest = async (
  userId: string,
  requestId: string,
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can approve access requests');
    }

    // Get request
    const request = await db.findOne(collection.accessRequests, {
      _id: new ObjectId(requestId),
      organizationId,
    }) as IAccessRequest | null;

    if (!request) {
      throw new Error('Access request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Request is not pending');
    }

    // Update request
    await db.updateOne(
      collection.accessRequests,
      { _id: request._id },
      {
        $set: {
          status: 'approved',
          reviewedBy: new ObjectId(userId),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // TODO: Grant actual access (create share record)
    // This would involve creating a Share record with appropriate permissions

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: request.scope === 'vault' ? 'vault' : 'item',
      targetId: request.resourceId.toString(),
      action: 'ACCESS_GRANTED',
      description: `Access request approved for ${request.scope}`,
      metadata: {
        scope: request.scope,
        requestedLevel: request.requestedLevel,
      },
      severity: 'info',
    });

    logger.info({ userId, requestId, organizationId }, 'Access request approved');
  } catch (error: any) {
    logger.error({ error: error.message, userId, requestId }, 'Failed to approve access request');
    throw error;
  }
};

/**
 * Reject access request
 */
export const rejectAccessRequest = async (
  userId: string,
  requestId: string,
  reviewComment: string,
  organizationId: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify admin user
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    const adminRole = ((adminUser as any).role || '').toLowerCase();
    if (adminRole !== 'admin' && adminRole !== 'super-admin') {
      throw new Error('Only admins can reject access requests');
    }

    // Get request
    const request = await db.findOne(collection.accessRequests, {
      _id: new ObjectId(requestId),
      organizationId,
    }) as IAccessRequest | null;

    if (!request) {
      throw new Error('Access request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Request is not pending');
    }

    // Update request
    await db.updateOne(
      collection.accessRequests,
      { _id: request._id },
      {
        $set: {
          status: 'rejected',
          reviewedBy: new ObjectId(userId),
          reviewedAt: new Date(),
          reviewComment,
          updatedAt: new Date(),
        },
      }
    );

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member',
      targetType: request.scope === 'vault' ? 'vault' : 'item',
      targetId: request.resourceId.toString(),
      action: 'ACCESS_REVOKED',
      description: `Access request rejected for ${request.scope}`,
      metadata: {
        scope: request.scope,
        reviewComment,
      },
      severity: 'warning',
    });

    logger.info({ userId, requestId, organizationId }, 'Access request rejected');
  } catch (error: any) {
    logger.error({ error: error.message, userId, requestId }, 'Failed to reject access request');
    throw error;
  }
};

