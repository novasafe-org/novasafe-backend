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
   * Organization identifier
   * For Team/Business: companyName from User model
   * For Individual/Family: userId or email domain
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

