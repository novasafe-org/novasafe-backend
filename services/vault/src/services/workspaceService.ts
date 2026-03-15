/**
 * Workspace Service
 *
 * Manages workspaces (organizations). Plans and billing belong to workspaces.
 * Users can belong to multiple workspaces via WorkspaceMember (Membership) records.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IWorkspace, WorkspaceType } from '../models/Workspace';
import { IUser } from '../models/User';
import { UserRole } from '../constants/rbac.constants';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Create a new workspace (e.g. on signup or when creating a team).
 */
export const createWorkspace = async (params: {
  name: string;
  type: WorkspaceType;
  ownerUserId: string | ObjectId;
}): Promise<IWorkspace> => {
  const db = new Database('vault');
  const now = new Date();
  const workspace: Omit<IWorkspace, '_id'> = {
    name: params.name,
    type: params.type,
    ownerUserId: new ObjectId(params.ownerUserId),
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.insertOne(collection.workspaces || 'workspaces', workspace);
  logger.info({ workspaceId: result.insertedId, ownerUserId: params.ownerUserId, type: params.type }, 'Workspace created');
  return { ...workspace, _id: result.insertedId } as IWorkspace;
};

/**
 * Get workspace by ID.
 */
export const getWorkspaceById = async (workspaceId: string | ObjectId): Promise<IWorkspace | null> => {
  const db = new Database('vault');
  const ws = await db.findOne(collection.workspaces || 'workspaces', {
    _id: new ObjectId(workspaceId),
  });
  return ws as IWorkspace | null;
};

/**
 * Check if a user belongs to a workspace (is a member or the owner).
 * Used to ensure e.g. Personal workspace is only accessible by that user.
 */
export const userBelongsToWorkspace = async (userId: string, workspaceId: string): Promise<boolean> => {
  if (!workspaceId || !userId) return false;
  const db = new Database('vault');
  const wsId = new ObjectId(workspaceId);
  const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
    userId: new ObjectId(userId),
    status: 'active',
    $or: [{ workspaceId: wsId }, { organizationId: workspaceId }],
  });
  if (membership) return true;
  const workspace = await getWorkspaceById(workspaceId);
  if (workspace && workspace.ownerUserId?.toString() === userId) return true;
  return false;
};

const isObjectIdString = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

/**
 * Get all workspaces a user belongs to (via Membership with workspaceId or organizationId).
 * Returns workspace IDs in order: owned first, then by createdAt.
 * Personal (individual) workspaces are only included if the user is the owner — so members
 * who had a bad membership in someone else's Personal workspace will no longer see it.
 */
export const getWorkspaceIdsForUser = async (userId: string): Promise<string[]> => {
  const db = new Database('vault');
  const memberships = await db.findMany(collection.organizationMembers || 'organizationMembers', {
    userId: new ObjectId(userId),
    status: 'active',
  });
  const ids: string[] = [];
  for (const m of memberships) {
    let wid: string | null = null;
    const rawWid = (m as any).workspaceId;
    if (rawWid) {
      wid = rawWid.toString?.() ?? rawWid;
    } else {
      const orgId = (m as any).organizationId;
      if (orgId && isObjectIdString(orgId)) wid = orgId;
      else if (orgId) wid = orgId;
    }
    if (wid && !ids.includes(wid)) {
      const ws = await getWorkspaceById(wid).catch(() => null);
      if (ws?.type === 'individual' && ws.ownerUserId?.toString() !== userId) {
        continue;
      }
      ids.push(wid);
    }
  }
  return ids;
};

/**
 * Get default workspace ID for a user (for API context when no workspace is specified).
 * Uses first membership with workspaceId, or legacy organizationId (companyName).
 * If user has no workspace, runs lazy migration: creates one from user.planId/companyName and adds Membership.
 */
export const getDefaultWorkspaceIdForUser = async (userId: string): Promise<string> => {
  const db = new Database('vault');
  const memberships = await db.findMany(collection.organizationMembers || 'organizationMembers', {
    userId: new ObjectId(userId),
    status: 'active',
  });

  for (const m of memberships) {
    let wid: string | null = null;
    const rawWid = (m as any).workspaceId;
    if (rawWid) {
      wid = rawWid.toString?.() ?? rawWid;
    } else {
      const orgId = (m as any).organizationId;
      if (orgId) wid = isObjectIdString(orgId) ? orgId : orgId;
    }
    if (!wid) continue;
    const ws = await getWorkspaceById(wid).catch(() => null);
    if (ws?.type === 'individual' && ws.ownerUserId?.toString() !== userId) continue;
    if (ws) return ws._id!.toString();
    return wid;
  }

  return ensureUserHasWorkspace(userId);
};

/**
 * Lazy migration: ensure user has at least one workspace and membership.
 * Creates a workspace from user.planId/companyName (or individual "Personal") and adds Membership.
 */
export const ensureUserHasWorkspace = async (userId: string): Promise<string> => {
  const db = new Database('vault');
  const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(userId) }) as IUser | null;
  if (!user) throw new Error('User not found');

  const planId = (user.planId || 'individual').toLowerCase();
  const type = (['individual', 'family', 'team', 'business'].includes(planId) ? planId : 'individual') as WorkspaceType;
  const name = user.companyName || 'Personal';

  const workspace = await createWorkspace({
    name,
    type,
    ownerUserId: userId,
  });

  const { upsertMembership } = await import('./rbacService');
  await upsertMembership(userId, workspace._id!.toString(), UserRole.OWNER as any, 'active', true);

  logger.info({ userId, workspaceId: workspace._id, type }, 'Lazy migration: workspace and membership created');
  return workspace._id!.toString();
};
