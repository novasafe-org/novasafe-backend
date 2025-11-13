/**
 * Session Management Controller
 * 
 * Handles session-related endpoints for managing active user sessions
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  getUserSessions,
  revokeSession,
  revokeAllSessions,
} from '../services/sessionService';
import logger from '../logger';

/**
 * Get all active sessions for the current user
 * @route GET /v/auth/sessions
 * @access Protected
 */
export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const sessions = await getUserSessions(req.user.id);
    const currentTokenId = (req as any).tokenId; // Get tokenId from auth middleware

    // Format sessions for frontend
    const formattedSessions = sessions.map((session) => ({
      id: session._id?.toString(),
      tokenId: session.tokenId,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      deviceInfo: {
        os: session.deviceInfo.os,
        browser: session.deviceInfo.browser,
        ipAddress: session.deviceInfo.ipAddress,
      },
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
      isCurrent: session.tokenId === currentTokenId, // Check if this is the current session
    }));

    res.status(200).json({
      sessions: formattedSessions,
      count: formattedSessions.length,
    });
  } catch (error: any) {
    logger.error(`Get sessions error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to get sessions',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Revoke a specific session
 * @route DELETE /v/auth/sessions/:sessionId
 * @access Protected
 */
export const revokeSessionById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        message: 'Bad Request',
        error: 'Session ID is required',
      });
      return;
    }

    await revokeSession(sessionId, req.user.id);

    res.status(200).json({
      message: 'Session revoked successfully',
      sessionId,
    });
  } catch (error: any) {
    logger.error(`Revoke session error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to revoke session',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Revoke all sessions except the current one
 * @route POST /v/auth/sessions/revoke-all
 * @access Protected
 */
export const revokeAllOtherSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', error: 'User not authenticated' });
      return;
    }

    const currentTokenId = (req as any).tokenId; // Set by auth middleware

    await revokeAllSessions(req.user.id, currentTokenId);

    res.status(200).json({
      message: 'All other sessions revoked successfully',
    });
  } catch (error: any) {
    logger.error(`Revoke all sessions error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to revoke sessions',
      error: error.message || 'An unexpected error occurred',
    });
  }
};

