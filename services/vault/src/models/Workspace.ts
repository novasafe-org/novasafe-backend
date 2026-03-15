/**
 * Workspace Model Interface
 *
 * Represents a workspace (organization) in the NovaSafe SaaS model.
 * Plans and billing belong to workspaces; users can belong to multiple workspaces.
 * One user identity per email; workspaces are the scope for vault data and subscriptions.
 */

import { ObjectId } from 'mongodb';

export type WorkspaceType = 'individual' | 'family' | 'team' | 'business';

export interface IWorkspace {
  _id?: ObjectId;

  /** Display name (e.g. "Personal", "Acme Corp") */
  name: string;

  /** Plan type for this workspace */
  type: WorkspaceType;

  /** User ID of the workspace owner (creator) */
  ownerUserId: ObjectId | string;

  createdAt: Date;
  updatedAt: Date;
}
