import { NextFunction, Request, Response } from 'express';
import { RequestContextManager } from '../../../shared/request-context';
import { getJwtTokenService } from '../tokens/jwt.token.service';
import { getSessionRepository } from '../repositories/session.repository';

const tokens = () => getJwtTokenService();
const sessions = () => getSessionRepository();

/** Full session only; blocks OAuth OTP pending tokens (vault/settings routes). */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const decoded = tokens().verify(authHeader.substring(7));
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
    RequestContextManager.enrichAuth({ userId: decoded.id, tokenId: decoded.jti });
    if (decoded.jti) {
      const session = await sessions().findActiveByTokenId(decoded.jti);
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

/** validate-session / logout: full session or OTP-pending JWT. */
export const sessionOrPendingAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const decoded = tokens().verify(authHeader.substring(7));
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;
    req.oauthOtpProvider = decoded.oauthOtpProvider;
    if (decoded.tokenType === 'oauth_otp_pending') {
      req.oauthOtpPending = true;
      RequestContextManager.enrichAuth({
        userId: decoded.id,
        tokenId: decoded.jti,
        oauthOtpPending: true,
      });
      next();
      return;
    }
    req.oauthOtpPending = false;
    RequestContextManager.enrichAuth({ userId: decoded.id, tokenId: decoded.jti });
    if (decoded.jti) {
      const session = await sessions().findActiveByTokenId(decoded.jti);
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

/** OAuth email OTP verify/resend routes. */
export const oauthPendingAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const decoded = tokens().verify(authHeader.substring(7));
    if (decoded.tokenType !== 'oauth_otp_pending') {
      res.status(400).json({ success: false, message: 'Invalid token for this verification step' });
      return;
    }
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, picture: decoded.picture };
    req.tokenId = decoded.jti;
    req.oauthOtpPending = true;
    req.oauthOtpProvider = decoded.oauthOtpProvider;
    RequestContextManager.enrichAuth({
      userId: decoded.id,
      tokenId: decoded.jti,
      oauthOtpPending: true,
    });
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
