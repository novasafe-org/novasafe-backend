/**
 * Activity Log Helper
 * 
 * Convenience functions for logging common events.
 * These helpers extract request metadata and user context automatically.
 */

import { Request } from 'express';
import { activityLogService, CreateActivityLogParams } from '../services/activityLogService';
import { getClientIp, getUserAgent, getLocationFromIp } from './requestUtils';
import { IUser } from '../models/User';

/**
 * Helper to log activity with automatic request metadata extraction
 * 
 * @param req - Express request object
 * @param user - User object (for organizationId and role)
 * @param params - Activity log parameters (without IP/userAgent/location)
 */
export async function logActivity(
  req: Request,
  user: IUser | null,
  params: Omit<CreateActivityLogParams, 'ipAddress' | 'userAgent' | 'location' | 'organizationId' | 'actorEmail' | 'actorRole'>
): Promise<void> {
  // Only log for team/business plans
  const planId = (user?.planId || 'individual').toLowerCase();
  if (planId !== 'team' && planId !== 'business') {
    return; // Skip logging for individual/free plans
  }

  // Must have companyName for organizationId
  if (!user?.companyName) {
    return; // Skip if no organization
  }

  // Extract request metadata
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const location = getLocationFromIp(ipAddress);

  // Determine actor role
  const userRole = ((user as any).role || 'member').toLowerCase();
  const actorRole = userRole === 'admin' || userRole === 'super-admin' ? 'admin' : 'member';

  // Create log entry
  await activityLogService.logEvent({
    organizationId: user.companyName,
    actorUserId: user._id?.toString() || null,
    actorEmail: user.email || null,
    actorRole,
    ipAddress,
    userAgent,
    location,
    ...params,
  });
}

/**
 * Helper to log system events (no user context)
 */
export async function logSystemActivity(
  req: Request,
  organizationId: string,
  params: Omit<CreateActivityLogParams, 'ipAddress' | 'userAgent' | 'location' | 'organizationId' | 'actorRole'>
): Promise<void> {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const location = getLocationFromIp(ipAddress);

  await activityLogService.logEvent({
    organizationId,
    actorUserId: null,
    actorEmail: null,
    actorRole: 'system',
    ipAddress,
    userAgent,
    location,
    ...params,
  });
}

