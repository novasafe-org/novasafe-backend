/**
 * Session Management Service
 * 
 * Handles creation, retrieval, and revocation of user sessions
 * Tracks device information and activity for security monitoring
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ISession } from '../models/Session';
import logger from '../logger';
import { detectDevice } from '../utils/deviceDetection';
import bcrypt from 'bcryptjs';

const collection = DBCONFIG.vault.collections;

export interface DeviceInfo {
  os: string;
  browser: string;
  ipAddress: string;
  userAgent: string;
}

export interface CreateSessionParams {
  userId: string | ObjectId;
  tokenId: string;
  refreshToken: string;
  deviceInfo: DeviceInfo;
  expiresInDays?: number; // Default: 30 days
}

/**
 * Create a new session for a user
 */
export const createSession = async (params: CreateSessionParams): Promise<ISession> => {
  try {
    const db = new Database('vault');
    const expiresInDays = params.expiresInDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Hash the refresh token before storing
    const refreshTokenHash = bcrypt.hashSync(params.refreshToken, 10);

    // Detect device type from user agent
    const deviceType = detectDevice(params.deviceInfo.userAgent);

    // Generate device name
    const deviceName = `${params.deviceInfo.browser} on ${params.deviceInfo.os}`;

    const session: Omit<ISession, '_id'> = {
      userId: new ObjectId(params.userId),
      tokenId: params.tokenId,
      refreshTokenHash,
      deviceName,
      deviceType,
      deviceInfo: params.deviceInfo,
      lastActivity: new Date(),
      createdAt: new Date(),
      expiresAt,
      revoked: false,
      revokedAt: null,
    };

    const result = await db.insertOne(collection.sessions, session);

    return {
      ...session,
      _id: result.insertedId,
    } as ISession;
  } catch (error: any) {
    logger.error(`Error creating session: ${error.message}`);
    throw error;
  }
};

/**
 * Get all active sessions for a user
 */
export const getUserSessions = async (userId: string | ObjectId): Promise<ISession[]> => {
  try {
    const db = new Database('vault');
    const sessions = await db.findMany(collection.sessions, {
      userId: new ObjectId(userId),
      revoked: false,
      expiresAt: { $gt: new Date() }, // Not expired
    }) as ISession[];

    // Sort by last activity (most recent first)
    if (sessions && sessions.length > 0) {
      sessions.sort((a, b) => {
        const dateA = new Date(a.lastActivity).getTime();
        const dateB = new Date(b.lastActivity).getTime();
        return dateB - dateA; // Descending order
      });
    }

    return sessions || [];
  } catch (error: any) {
    logger.error(`Error getting user sessions: ${error.message}`);
    throw error;
  }
};

/**
 * Get a specific session by token ID
 */
export const getSessionByTokenId = async (tokenId: string): Promise<ISession | null> => {
  try {
    const db = new Database('vault');
    const session = await db.findOne(collection.sessions, {
      tokenId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }) as ISession | null;

    return session;
  } catch (error: any) {
    logger.error(`Error getting session by token ID: ${error.message}`);
    return null;
  }
};

/**
 * Update session last activity timestamp
 */
export const updateSessionActivity = async (tokenId: string): Promise<void> => {
  try {
    const db = new Database('vault');
    await db.updateOne(
      collection.sessions,
      { tokenId, revoked: false },
      {
        $set: {
          lastActivity: new Date(),
        },
      }
    );
  } catch (error: any) {
    logger.error(`Error updating session activity: ${error.message}`);
    // Don't throw - this is not critical
  }
};

/**
 * Revoke a specific session
 */
export const revokeSession = async (sessionId: string, userId: string | ObjectId): Promise<void> => {
  try {
    const db = new Database('vault');
    await db.updateOne(
      collection.sessions,
      {
        _id: new ObjectId(sessionId),
        userId: new ObjectId(userId), // Ensure user owns the session
      },
      {
        $set: {
          revoked: true,
          revokedAt: new Date(),
        },
      }
    );

    logger.info(`Session revoked: ${sessionId} for user: ${userId}`);
  } catch (error: any) {
    logger.error(`Error revoking session: ${error.message}`);
    throw error;
  }
};

/**
 * Revoke all sessions for a user (except optionally one)
 */
export const revokeAllSessions = async (
  userId: string | ObjectId,
  excludeTokenId?: string
): Promise<void> => {
  try {
    const db = new Database('vault');
    const query: any = {
      userId: new ObjectId(userId),
      revoked: false,
    };

    if (excludeTokenId) {
      query.tokenId = { $ne: excludeTokenId };
    }

    await db.updateMany(
      collection.sessions,
      query,
      {
        $set: {
          revoked: true,
          revokedAt: new Date(),
        },
      }
    );

    logger.info(`All sessions revoked for user: ${userId} (excluding: ${excludeTokenId || 'none'})`);
  } catch (error: any) {
    logger.error(`Error revoking all sessions: ${error.message}`);
    throw error;
  }
};

/**
 * Cleanup expired sessions (can be called by a cron job)
 */
export const cleanupExpiredSessions = async (): Promise<number> => {
  try {
    const db = new Database('vault');
    const result = await db.deleteMany(collection.sessions, {
      expiresAt: { $lt: new Date() },
    });

    logger.info(`Cleaned up ${result.deletedCount} expired sessions`);
    return result.deletedCount || 0;
  } catch (error: any) {
    logger.error(`Error cleaning up expired sessions: ${error.message}`);
    return 0;
  }
};

