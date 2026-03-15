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
const isObjectIdString = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

/**
 * Verify user is admin/owner for the organization (workspace id or legacy companyName).
 * Returns the user and role for use in logging. Throws if not authorized.
 */
async function verifyAdminForOrganization(
  userId: string,
  organizationId: string
): Promise<{ user: IUser; role: string }> {
  const db = new Database('vault');
  const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) }) as IUser | null;
  if (!user) throw new Error('User not found');
  if (isObjectIdString(organizationId)) {
    const { getUserRole } = await import('./rbacService');
    const { UserRole } = await import('../constants/rbac.constants');
    const role = await getUserRole(userId, organizationId);
    if (role !== UserRole.OWNER && role !== UserRole.ADMIN) throw new Error('Only workspace owners or admins can perform this action');
    return { user, role };
  }
  if ((user as any).companyName !== organizationId) throw new Error('Admin user not found');
  const role = ((user as any).role || '').toLowerCase();
  if (role !== 'admin' && role !== 'super-admin') throw new Error('Only admins can perform this action');
  return { user, role: role === 'admin' || role === 'super-admin' ? 'admin' : 'member' };
}

/**
 * Generate a secure invitation token
 */
const generateInvitationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Get all users in a workspace/organization.
 * When organizationId is a workspace id, uses Membership; else legacy companyName.
 */
export const getOrganizationUsers = async (
  organizationId: string,
  userId: string
): Promise<IUser[]> => {
  try {
    const db = new Database('vault');
    if (isObjectIdString(organizationId)) {
      const { getUserRole } = await import('./rbacService');
      const role = await getUserRole(userId, organizationId);
      if (role !== 'owner' && role !== 'admin') throw new Error('Only workspace owners or admins can view users');
      const { getOrganizationMembers } = await import('./rbacService');
      const members = await getOrganizationMembers(organizationId);
      const userIds = members.map((m: any) => m.userId).filter(Boolean);
      if (userIds.length === 0) return [];
      const users = await db.findMany(collection.vaultUsers, {
        _id: { $in: userIds.map((id: any) => new ObjectId(id.toString?.() ?? id)) },
      });
      return users as IUser[];
    }
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(userId),
      companyName: organizationId,
    }) as IUser | null;
    if (!adminUser) throw new Error('User not found or not authorized');
    const userRole = ((adminUser as any).role || '').toLowerCase();
    if (userRole !== 'admin' && userRole !== 'super-admin') throw new Error('Only admins can view organization users');
    const users = await db.findMany(collection.vaultUsers, { companyName: organizationId });
    return users as IUser[];
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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    let targetUser: IUser | null;
    let oldRole: string;

    if (isObjectIdString(organizationId)) {
      const { getOrganizationMembers } = await import('./rbacService');
      const members = await getOrganizationMembers(organizationId);
      const targetMember = members.find((m: any) => (m.userId?.toString?.() ?? m.userId) === targetUserId);
      if (!targetMember) throw new Error('Target user not found');
      oldRole = (targetMember as any).role || 'member';
      if (userId === targetUserId && newRole !== 'admin' && (oldRole === 'owner' || oldRole === 'admin')) {
        const adminCount = members.filter((m: any) => ['owner', 'admin'].includes((m as any).role)).length;
        if (adminCount <= 1) throw new Error('Cannot remove the last admin from organization');
      }
      const memColl = collection.organizationMembers || 'organizationMembers';
      await db.updateOne(
        memColl,
        { userId: new ObjectId(targetUserId), $or: [{ workspaceId: new ObjectId(organizationId) }, { organizationId }] },
        { $set: { role: newRole, updatedAt: new Date() } }
      );
      targetUser = await db.findOne(collection.vaultUsers, { _id: new ObjectId(targetUserId) }) as IUser | null;
    } else {
      targetUser = await db.findOne(collection.vaultUsers, {
        _id: new ObjectId(targetUserId),
        companyName: organizationId,
      }) as IUser | null;
      if (!targetUser) throw new Error('Target user not found');
      oldRole = (targetUser as any).role || 'member';
      if (userId === targetUserId && newRole !== 'admin') {
        const dbInstance = db.getDb();
        const adminCount = await dbInstance.collection(collection.vaultUsers).countDocuments({
          companyName: organizationId,
          role: { $in: ['admin', 'super-admin'] },
        });
        if (adminCount <= 1) throw new Error('Cannot remove the last admin from organization');
      }
      await db.updateOne(
        collection.vaultUsers,
        { _id: new ObjectId(targetUserId) },
        { $set: { role: newRole, updatedAt: new Date() } }
      );
    }

    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
      targetType: 'user',
      targetId: targetUserId,
      action: 'ROLE_CHANGED',
      description: `User role changed from ${oldRole} to ${newRole}`,
      metadata: {
        oldRole,
        newRole,
        targetUserEmail: targetUser?.email,
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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    if (userId === targetUserId) {
      throw new Error('Cannot suspend your own account');
    }

    let targetUser: IUser | null;
    if (isObjectIdString(organizationId)) {
      const { getOrganizationMembers } = await import('./rbacService');
      const members = await getOrganizationMembers(organizationId);
      const targetMember = members.find((m: any) => (m.userId?.toString?.() ?? m.userId) === targetUserId);
      if (!targetMember) throw new Error('Target user not found');
      const memColl = collection.organizationMembers || 'organizationMembers';
      await db.updateOne(
        memColl,
        { userId: new ObjectId(targetUserId), $or: [{ workspaceId: new ObjectId(organizationId) }, { organizationId }] },
        { $set: { status, updatedAt: new Date() } }
      );
      targetUser = await db.findOne(collection.vaultUsers, { _id: new ObjectId(targetUserId) }) as IUser | null;
    } else {
      targetUser = await db.findOne(collection.vaultUsers, {
        _id: new ObjectId(targetUserId),
        companyName: organizationId,
      }) as IUser | null;
      if (!targetUser) throw new Error('Target user not found');
      if (status === 'suspended') {
        await db.updateOne(
          collection.vaultUsers,
          { _id: new ObjectId(targetUserId) },
          { $set: { accountLockedUntil: new Date('2099-12-31'), updatedAt: new Date() } }
        );
      } else {
        await db.updateOne(
          collection.vaultUsers,
          { _id: new ObjectId(targetUserId) },
          { $set: { accountLockedUntil: null, updatedAt: new Date() } }
        );
      }
    }

    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
      targetType: 'user',
      targetId: targetUserId,
      action: status === 'suspended' ? 'MEMBER_REMOVED' : 'MEMBER_ADDED',
      description: `User ${status === 'suspended' ? 'suspended' : 'activated'}`,
      metadata: {
        status,
        targetUserEmail: targetUser?.email,
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

    let adminUser = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) }) as IUser | null;
    if (!adminUser) throw new Error('User not found');
    const isWorkspaceId = isObjectIdString(organizationId);
    let actorRoleForLog: string;
    if (isWorkspaceId) {
      const { getUserRole } = await import('./rbacService');
      const { UserRole } = await import('../constants/rbac.constants');
      const role = await getUserRole(userId, organizationId);
      if (role !== UserRole.OWNER && role !== UserRole.ADMIN) throw new Error('Only workspace owners or admins can create invitations');
      actorRoleForLog = role;
    } else {
      if ((adminUser as any).companyName !== organizationId) throw new Error('Admin user not found');
      const adminRole = ((adminUser as any).role || '').toLowerCase();
      if (adminRole !== 'admin' && adminRole !== 'super-admin') throw new Error('Only admins can create invitations');
      actorRoleForLog = adminRole === 'admin' || adminRole === 'super-admin' ? 'admin' : 'member';
    }

    const existingUser = await db.findOne(collection.vaultUsers, {
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      const { getOrganizationMembers } = await import('./rbacService');
      const members = await getOrganizationMembers(organizationId);
      const alreadyMember = members.some((m: any) => m.userId?.toString?.() === existingUser._id?.toString());
      if (alreadyMember) throw new Error('User is already a member of this workspace');
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const invitationData: any = {
      email: email.toLowerCase().trim(),
      role,
      organizationId,
      invitedBy: new ObjectId(userId),
      vaultIds: vaultIds && vaultIds.length > 0 ? vaultIds.map((id: string) => new ObjectId(id)) : [],
      status: 'pending',
      token: generateInvitationToken(),
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (isObjectIdString(organizationId)) invitationData.workspaceId = new ObjectId(organizationId);
    const invitation = invitationData as Omit<IInvitation, '_id'>;

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
          logger.error({ 
            email, 
            organizationId,
            smtpHost: process.env.SMTP_HOST,
            smtpPort: process.env.SMTP_PORT,
            smtpUser: process.env.SMTP_USER ? '***configured***' : 'NOT SET',
            smtpPassword: process.env.SMTP_PASSWORD ? '***configured***' : 'NOT SET',
          }, 'Failed to send invitation email, but invitation was created. Check SMTP configuration and server logs for details.');
        } else {
          logger.info({ email, organizationId }, 'Invitation email sent successfully');
        }
      } catch (error: any) {
        logger.error({ 
          error: error.message, 
          email,
          stack: error.stack,
          code: error.code 
        }, 'Error sending invitation email');
        // Don't fail the invitation creation if email fails, but log the error
      }
    }

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: (actorRoleForLog === 'owner' || actorRoleForLog === 'admin' ? 'admin' : 'member') as any,
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
    await verifyAdminForOrganization(userId, organizationId);

    const invitationFilter: any = isObjectIdString(organizationId)
      ? { $or: [{ workspaceId: new ObjectId(organizationId) }, { organizationId }] }
      : { organizationId };
    const invitations = await db.findMany(collection.invitations, invitationFilter) as IInvitation[];

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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    const invQuery: any = { _id: new ObjectId(invitationId) };
    if (isObjectIdString(organizationId)) {
      invQuery.$or = [{ workspaceId: new ObjectId(organizationId) }, { organizationId }];
    } else {
      invQuery.organizationId = organizationId;
    }
    const invitation = await db.findOne(collection.invitations, invQuery) as IInvitation | null;

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
      logger.info({ invitationId, email: invitation.email }, 'Attempting to resend invitation email');
      const emailSent = await sendInvitationEmail(
        invitation.email,
        updatedInvitation.token,
        organizationId,
        invitation.role,
        adminUser.name || adminUser.email,
        expiresAt
      );
      if (!emailSent) {
        logger.error({ 
          email: invitation.email,
          invitationId,
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT,
          smtpUser: process.env.SMTP_USER ? '***configured***' : 'NOT SET',
          smtpPassword: process.env.SMTP_PASSWORD ? '***configured***' : 'NOT SET',
        }, 'Failed to send resend invitation email, but invitation was updated. Check SMTP configuration and server logs.');
      } else {
        logger.info({ email: invitation.email, invitationId }, 'Resend invitation email sent successfully');
      }
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        email: invitation.email,
        invitationId,
        stack: error.stack,
        code: error.code 
      }, 'Error sending resend invitation email');
      // Don't fail the resend if email fails
    }

    // Log activity
    await activityLogService.logEvent({
      organizationId,
      actorUserId: userId,
      actorEmail: adminUser.email,
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    const invQuery: any = { _id: new ObjectId(invitationId) };
    if (isObjectIdString(organizationId)) {
      invQuery.$or = [{ workspaceId: new ObjectId(organizationId) }, { organizationId }];
    } else {
      invQuery.organizationId = organizationId;
    }
    const invitation = await db.findOne(collection.invitations, invQuery) as IInvitation | null;

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
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
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
    await verifyAdminForOrganization(userId, organizationId);

    let orgUserIds: ObjectId[];
    if (isObjectIdString(organizationId)) {
      const { getOrganizationMembers } = await import('./rbacService');
      const members = await getOrganizationMembers(organizationId);
      orgUserIds = members.map((m: any) => m.userId).filter(Boolean).map((id: any) => new ObjectId(id.toString?.() ?? id));
    } else {
      const orgUsers = await db.findMany(collection.vaultUsers, { companyName: organizationId }) as IUser[];
      orgUserIds = orgUsers.map(u => u._id as ObjectId);
    }
    if (orgUserIds.length === 0) return [];

    const dbInstance = db.getDb();
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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    const folder = await db.findOne(collection.folders, {
      _id: new ObjectId(vaultId),
    }) as IFolder | null;

    if (!folder) {
      throw new Error('Vault not found');
    }

    const belongsToOrg = isObjectIdString(organizationId)
      ? (folder as any).workspaceId?.toString() === organizationId
      : (await db.findOne(collection.vaultUsers, { _id: new ObjectId(folder.userId) }) as IUser | null)?.companyName === organizationId;
    if (!belongsToOrg) {
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
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
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
    await verifyAdminForOrganization(userId, organizationId);

    const requestFilter: any = isObjectIdString(organizationId)
      ? { $or: [{ workspaceId: new ObjectId(organizationId) }, { organizationId }] }
      : { organizationId };
    const requests = await db.findMany(collection.accessRequests, requestFilter) as IAccessRequest[];

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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    const requestQuery: any = { _id: new ObjectId(requestId) };
    if (isObjectIdString(organizationId)) {
      requestQuery.$or = [{ workspaceId: new ObjectId(organizationId) }, { organizationId }];
    } else {
      requestQuery.organizationId = organizationId;
    }
    const request = await db.findOne(collection.accessRequests, requestQuery) as IAccessRequest | null;

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
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
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
    const { user: adminUser, role: adminRole } = await verifyAdminForOrganization(userId, organizationId);

    const requestQuery: any = { _id: new ObjectId(requestId) };
    if (isObjectIdString(organizationId)) {
      requestQuery.$or = [{ workspaceId: new ObjectId(organizationId) }, { organizationId }];
    } else {
      requestQuery.organizationId = organizationId;
    }
    const request = await db.findOne(collection.accessRequests, requestQuery) as IAccessRequest | null;

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
      actorRole: (adminRole === 'owner' || adminRole === 'admin' ? 'admin' : 'member') as any,
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

/**
 * Get invitation by token (public endpoint - no auth required)
 * Used to verify invitation and get invitation details for acceptance flow
 */
export const getInvitationByToken = async (token: string): Promise<IInvitation | null> => {
  try {
    const db = new Database('vault');
    
    // Find invitation by token
    const invitation = await db.findOne(collection.invitations, {
      token,
      status: 'pending',
    }) as IInvitation | null;

    if (!invitation) {
      return null;
    }

    // Check if invitation is expired
    const now = new Date();
    if (new Date(invitation.expiresAt) < now) {
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
      return null;
    }

    return invitation;
  } catch (error: any) {
    logger.error({ error: error.message, token }, 'Failed to get invitation by token');
    throw error;
  }
};

/**
 * Accept invitation and create account for invited user
 * This creates a new user account with the invited role and organization
 */
export const acceptInvitation = async (
  token: string,
  userData: {
    name: string;
    password: string;
    signupMethod: 'email' | 'google';
    googleId?: string;
    picture?: string;
  }
): Promise<{ user: IUser; invitation: IInvitation }> => {
  try {
    const db = new Database('vault');

    // Get invitation by token
    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      throw new Error('Invalid or expired invitation token');
    }

    // Check if email already exists
    const existingUser = await db.findOne(collection.vaultUsers, {
      email: invitation.email.toLowerCase().trim(),
    }) as IUser | null;

    if (existingUser) {
      // Same email can belong to multiple workspaces; add them to this workspace
      await db.updateOne(
        collection.invitations,
        { _id: invitation._id },
        {
          $set: {
            status: 'accepted',
            acceptedAt: new Date(),
            acceptedBy: existingUser._id,
            updatedAt: new Date(),
          },
        }
      );

      // Update user role if needed
      if ((existingUser as any).role !== invitation.role) {
        await db.updateOne(
          collection.vaultUsers,
          { _id: existingUser._id },
          {
            $set: {
              role: invitation.role,
              updatedAt: new Date(),
            },
          }
        );
        (existingUser as any).role = invitation.role;
      }

      const { upsertMembership } = await import('./rbacService');
      const workspaceOrOrgId = (invitation as any).workspaceId?.toString?.() ?? invitation.organizationId;
      const forceWorkspaceId = !!(invitation as any).workspaceId;
      const displayNameForWorkspace = (userData.name ?? '').trim();
      logger.info({ userId: existingUser._id, workspaceOrOrgId, displayName: displayNameForWorkspace }, 'Accept invite (existing user): saving workspace display name to membership');
      await upsertMembership(
        existingUser._id!.toString(),
        workspaceOrOrgId,
        invitation.role as any,
        'active',
        forceWorkspaceId,
        displayNameForWorkspace || undefined
      );

      // Log activity
      await activityLogService.logEvent({
        organizationId: invitation.organizationId,
        actorUserId: existingUser._id!.toString(),
        actorEmail: existingUser.email,
        actorRole: invitation.role as any,
        targetType: 'invitation' as const,
        targetId: invitation._id!.toString(),
        action: 'INVITATION_ACCEPTED',
        description: `Invitation accepted by ${existingUser.email}`,
        metadata: {
          email: existingUser.email,
          role: invitation.role,
        },
        severity: 'info',
      });

      return { user: existingUser, invitation };
    }

    // Create new user account
    const bcrypt = await import('bcryptjs');
    const passwordHash = userData.signupMethod === 'email' 
      ? bcrypt.hashSync(userData.password, 10) 
      : undefined;

    // Get organization details from the admin who sent the invitation
    const adminUser = await db.findOne(collection.vaultUsers, {
      _id: new ObjectId(invitation.invitedBy),
    }) as IUser | null;

    if (!adminUser) {
      throw new Error('Organization not found');
    }

    // Create user (no companyName; membership links them to workspace)
    const newUser: any = {
      email: invitation.email.toLowerCase().trim(),
      name: userData.name,
      signupMethod: userData.signupMethod,
      passwordHash,
      emailVerified: userData.signupMethod === 'google',
      emailVerifiedAt: userData.signupMethod === 'google' ? new Date() : null,
      onboardingCompleted: false,
      planId: adminUser.planId,
      googleId: userData.googleId,
      picture: userData.picture,
      totpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert user
    const result = await db.insertOne(collection.vaultUsers, newUser);
    const user: IUser = {
      ...newUser,
      _id: result.insertedId,
    };

    // Update invitation status
    await db.updateOne(
      collection.invitations,
      { _id: invitation._id },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: result.insertedId,
          updatedAt: new Date(),
        },
      }
    );

    const { upsertMembership } = await import('./rbacService');
    const workspaceOrOrgId = (invitation as any).workspaceId?.toString?.() ?? invitation.organizationId;
    const forceWorkspaceId = !!(invitation as any).workspaceId;
    const displayNameForWorkspace = (userData.name ?? '').trim();
    logger.info({ userId: result.insertedId, workspaceOrOrgId, displayName: displayNameForWorkspace }, 'Accept invite (new user): saving workspace display name to membership');
    await upsertMembership(
      result.insertedId.toString(),
      workspaceOrOrgId,
      invitation.role as any,
      'active',
      forceWorkspaceId,
      displayNameForWorkspace || undefined
    );

    // Log activity
    await activityLogService.logEvent({
      organizationId: invitation.organizationId,
      actorUserId: result.insertedId.toString(),
      actorEmail: user.email,
      actorRole: invitation.role as any,
      targetType: 'invitation' as const,
      targetId: invitation._id!.toString(),
      action: 'INVITATION_ACCEPTED',
      description: `Invitation accepted by ${user.email}`,
      metadata: {
        email: user.email,
        role: invitation.role,
      },
      severity: 'info',
    });

    logger.info({ email: user.email, role: invitation.role, organizationId: invitation.organizationId }, 'Invitation accepted and account created');

    return { user, invitation };
  } catch (error: any) {
    logger.error({ error: error.message, token }, 'Failed to accept invitation');
    throw error;
  }
};

