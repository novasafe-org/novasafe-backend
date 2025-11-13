/**
 * Session Management Routes
 * 
 * Handles session-related endpoints
 * 
 * BASE PATH: /v/auth/sessions
 */

import express from 'express';
import {
  getSessions,
  revokeSessionById,
  revokeAllOtherSessions,
} from '../controllers/SessionController';
import { authMiddleware } from '../middlewares/auth';

const router = express.Router();

/**
 * @route   GET /v/auth/sessions
 * @desc    Get all active sessions for current user
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "sessions": [
 *     {
 *       "id": "507f1f77bcf86cd799439011",
 *       "tokenId": "abc123...",
 *       "deviceName": "Chrome on Windows 10",
 *       "deviceType": "desktop",
 *       "deviceInfo": {
 *         "os": "Windows 10/11",
 *         "browser": "Chrome 120",
 *         "ipAddress": "192.168.1.1"
 *       },
 *       "lastActivity": "2024-01-15T10:30:00.000Z",
 *       "createdAt": "2024-01-15T09:00:00.000Z",
 *       "isCurrent": true
 *     }
 *   ],
 *   "count": 3
 * }
 */
router.get('/', authMiddleware, getSessions);

/**
 * @route   DELETE /v/auth/sessions/:sessionId
 * @desc    Revoke a specific session
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "message": "Session revoked successfully",
 *   "sessionId": "507f1f77bcf86cd799439011"
 * }
 */
router.delete('/:sessionId', authMiddleware, revokeSessionById);

/**
 * @route   POST /v/auth/sessions/revoke-all
 * @desc    Revoke all sessions except the current one
 * @access  Protected (requires JWT token)
 * 
 * RESPONSE:
 * {
 *   "message": "All other sessions revoked successfully"
 * }
 */
router.post('/revoke-all', authMiddleware, revokeAllOtherSessions);

export default router;

