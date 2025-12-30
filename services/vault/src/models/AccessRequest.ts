/**
 * Access Request Model Interface
 * 
 * Represents a request from a user to gain access to a specific vault or item.
 * Access requests are reviewed by admins who can approve or reject them.
 */

import { ObjectId } from 'mongodb';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type AccessScope = 'vault' | 'item';
export type PermissionLevel = 'read' | 'write' | 'manage';

export interface IAccessRequest {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * User ID who requested access
   * References the User collection
   */
  userId: ObjectId | string;

  /**
   * Organization identifier (companyName from User model)
   * Used to group requests by organization
   */
  organizationId: string;

  /**
   * Scope of the request: 'vault' or 'item'
   */
  scope: AccessScope;

  /**
   * ID of the vault or item being requested
   * References either folders or vaultItems collection
   */
  resourceId: ObjectId | string;

  /**
   * Requested permission level
   * 'read' | 'write' | 'manage'
   */
  requestedLevel: PermissionLevel;

  /**
   * Optional reason/message from the requester
   */
  reason?: string;

  /**
   * Request status
   */
  status: AccessRequestStatus;

  /**
   * Timestamp when request was created
   */
  requestedAt: Date | string;

  /**
   * Timestamp when request was last updated
   */
  updatedAt: Date | string;

  /**
   * User ID who reviewed the request (admin)
   * References the User collection
   * Optional: null if not reviewed
   */
  reviewedBy?: ObjectId | string | null;

  /**
   * Timestamp when request was reviewed
   * Optional: null if not reviewed
   */
  reviewedAt?: Date | string | null;

  /**
   * Optional comment from the reviewer
   */
  reviewComment?: string;
}

