/**
 * Membership Model Interface
 * 
 * Represents a user's membership in an organization (Team/Business plan).
 * Tracks the relationship between users and organizations with their roles.
 * 
 * For Individual and Family plans, users are implicitly members of their own "organization"
 * (represented by their userId or email domain).
 */

import { ObjectId } from 'mongodb';

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export interface IMembership {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User ID who is a member
   * References the User collection
   */
  userId: ObjectId | string;

  /**
   * Workspace ID (preferred). References Workspace collection.
   * When set, this membership is for that workspace.
   */
  workspaceId?: ObjectId | string;

  /**
   * Organization identifier (legacy).
   * For new data: same as workspaceId (string). For legacy: companyName from User.
   */
  organizationId: string;

  /**
   * User's role in the organization
   * 'owner' | 'admin' | 'member' | 'viewer'
   */
  role: 'owner' | 'admin' | 'member' | 'viewer';

  /**
   * Membership status
   * 'active': User is active member
   * 'invited': User has been invited but not yet accepted
   * 'suspended': User's access has been suspended
   */
  status: MembershipStatus;

  /**
   * Email that was invited (for invited status, before user signs up).
   * Optional; used when invitation is pending.
   */
  invitedEmail?: string;

  /**
   * Display name for this user in this workspace (optional).
   * When set, shown in UI instead of global user.name when in this workspace.
   */
  displayName?: string;

  /**
   * Timestamp when membership was created
   */
  createdAt: Date | string;

  /**
   * Timestamp when membership was last updated
   */
  updatedAt: Date | string;

  /**
   * Timestamp when membership was suspended (if applicable)
   * Optional: null if not suspended
   */
  suspendedAt?: Date | string | null;

  /**
   * User ID who suspended this membership (if applicable)
   * Optional: null if not suspended
   */
  suspendedBy?: ObjectId | string | null;

  /**
   * Timestamp when membership was removed/revoked
   * Optional: null if still active
   */
  removedAt?: Date | string | null;

  /**
   * User ID who removed this membership (if applicable)
   * Optional: null if not removed
   */
  removedBy?: ObjectId | string | null;
}

