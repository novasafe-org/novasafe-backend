import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/generateToken';
import { IUserPayload } from '../models/User';
import { getSessionByTokenId, updateSessionActivity } from '../services/sessionService';

/**
 * Extend Express Request to include user payload
 * This allows downstream route handlers to access req.user
 */
declare global {
  namespace Express {
    interface Request {
      user?: IUserPayload;
    }
  }
}

/**
 * Authentication Middleware
 * 
 * This middleware protects routes by verifying JWT tokens from the Authorization header.
 * It ensures that only authenticated users with valid tokens can access protected endpoints.
 * 
 * USAGE:
 * - Apply to any route that requires authentication
 * - Example: router.get('/protected', authMiddleware, protectedController)
 * 
 * SECURITY NOTES:
 * - Always use HTTPS in production to prevent token interception
 * - Frontend should store tokens securely (httpOnly cookies or memory, not localStorage if XSS is a concern)
 * - Tokens are validated on every request
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    // Expected format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'No authorization header provided'
      });
      return;
    }

    // Check if header follows Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        message: 'Invalid authorization format',
        error: 'Authorization header must be in format: Bearer <token>'
      });
      return;
    }

    // Extract the token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'No token provided'
      });
      return;
    }

    // Verify and decode the token
    const decoded = verifyToken(token);

    // Check if session is revoked (if tokenId exists)
    if (decoded.jti) {
      const session = await getSessionByTokenId(decoded.jti);
      
      // If session doesn't exist or is revoked, reject the request
      if (!session || session.revoked) {
        res.status(401).json({ 
          message: 'Session revoked',
          error: 'Your session has been revoked. Please log in again.',
          code: 'SESSION_REVOKED'
        });
        return;
      }

      // Check if session is expired
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        res.status(401).json({ 
          message: 'Session expired',
          error: 'Your session has expired. Please log in again.',
          code: 'SESSION_EXPIRED'
        });
        return;
      }

      // Update last activity (don't await to avoid blocking the request)
      // This is fire-and-forget for performance
      updateSessionActivity(decoded.jti).catch(() => {
        // Silently fail - activity update is not critical
      });
    }

    // Attach user payload to request object for use in route handlers
    req.user = decoded;

    // Attach tokenId to request for session tracking
    (req as any).tokenId = decoded.jti;

    // Proceed to next middleware or route handler
    next();
  } catch (error: any) {
    // Token verification failed
    res.status(401).json({ 
      message: 'Invalid or expired token',
      error: error.message
    });
  }
};

