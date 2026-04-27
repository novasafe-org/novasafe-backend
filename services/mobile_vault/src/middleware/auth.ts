import { NextFunction, Request, Response } from 'express';
import Database from '../database/connection';
import { DB_CONFIG } from '../config/dbConfig';
import { verifyToken } from '../utils/token';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name?: string; picture?: string };
      tokenId?: string;
    }
  }
}

const db = new Database('vault');

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(authHeader.substring(7));
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;

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
