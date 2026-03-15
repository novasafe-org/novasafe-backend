/**
 * Invitation Model Interface
 * 
 * Represents an invitation sent to a user to join an organization (Team/Business plan).
 * Invitations are sent by admins and can be accepted, expired, or revoked.
 */

import { ObjectId } from 'mongodb';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface IInvitation {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * Email address of the invited user
   */
  email: string;

  /**
   * Role assigned to the user upon acceptance
   * 'admin' | 'member' | 'viewer'
   */
  role: 'admin' | 'member' | 'viewer';

  /**
   * Workspace ID (preferred). References Workspace collection.
   */
  workspaceId?: ObjectId | string;

  /**
   * Organization identifier (legacy: companyName; or same as workspaceId when workspace-based)
   */
  organizationId: string;

  /**
   * User ID who sent the invitation (admin)
   * References the User collection
   */
  invitedBy: ObjectId | string;

  /**
   * Array of vault IDs that the user will have access to
   * Empty array means access to all vaults
   */
  vaultIds: (ObjectId | string)[];

  /**
   * Invitation status
   */
  status: InvitationStatus;

  /**
   * Unique invitation token for accepting the invitation
   * Generated as a secure random token
   */
  token: string;

  /**
   * Timestamp when invitation expires
   * Default: 7 days from creation
   */
  expiresAt: Date | string;

  /**
   * Timestamp when invitation was created
   */
  createdAt: Date | string;

  /**
   * Timestamp when invitation was last updated
   */
  updatedAt: Date | string;

  /**
   * Timestamp when invitation was accepted
   * Optional: null if not accepted
   */
  acceptedAt?: Date | string | null;

  /**
   * User ID who accepted the invitation
   * References the User collection
   * Optional: null if not accepted
   */
  acceptedBy?: ObjectId | string | null;

  /**
   * Timestamp when invitation was revoked
   * Optional: null if not revoked
   */
  revokedAt?: Date | string | null;

  /**
   * User ID who revoked the invitation
   * References the User collection
   * Optional: null if not revoked
   */
  revokedBy?: ObjectId | string | null;
}

