import { NextFunction, Request, Response } from 'express';
import Database from '../database/connection';
import { DB_CONFIG } from '../config/dbConfig';
import { verifyToken } from '../utils/token';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name?: string; picture?: string };
      tokenId?: string;
      /** True when JWT is the short-lived Google email OTP token (not a full vault session). */
      oauthOtpPending?: boolean;
    }
  }
}

const db = new Database('vault');

/** Vault + settings routes: full session only; blocks Google OTP pending tokens. */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (decoded.tokenType === 'oauth_otp_pending') {
      res.status(403).json({
        success: false,
        code: 'NOVASAFE_EMAIL_OTP_REQUIRED',
        message: 'Complete email verification to access your vault.',
      });
      return;
    }

    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;
    req.oauthOtpPending = false;

    if (decoded.jti) {
      const session = await db.findOne(DB_CONFIG.collections.sessions, { tokenId: decoded.jti, revoked: { $ne: true } });
      if (!session) {
        res.status(401).json({ success: false, message: 'Session revoked' });
        return;
      }
    }

    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * validate-session / logout: accepts full session JWT or Google OTP pending JWT
 * (pending has no DB session row).
 */
export const sessionOrPendingAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(authHeader.substring(7));
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;

    if (decoded.tokenType === 'oauth_otp_pending') {
      req.oauthOtpPending = true;
      next();
      return;
    }

    req.oauthOtpPending = false;

    if (decoded.jti) {
      const session = await db.findOne(DB_CONFIG.collections.sessions, { tokenId: decoded.jti, revoked: { $ne: true } });
      if (!session) {
        res.status(401).json({ success: false, message: 'Session revoked' });
        return;
      }
    }

    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/** Only Google OTP pending JWT (verify + resend OTP). */
export const oauthPendingAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (decoded.tokenType !== 'oauth_otp_pending') {
      res.status(400).json({ success: false, message: 'Invalid token for this verification step' });
      return;
    }

    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;
    req.oauthOtpPending = true;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
