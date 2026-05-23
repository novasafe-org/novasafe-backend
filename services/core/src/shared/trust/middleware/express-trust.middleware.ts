import type { NextFunction, Request, Response } from 'express';
import type { HttpIncomingMessage } from '../../request-context/types';
import { TrustBlockedError, runTrustVerification } from './trust-verification.middleware';

const toHttpMessage = (req: Request): HttpIncomingMessage => ({
  method: req.method,
  path: req.path,
  originalUrl: req.originalUrl,
  headers: req.headers as HttpIncomingMessage['headers'],
  body: req.body,
  remoteAddress: req.socket.remoteAddress,
});

/**
 * Express adapter for trust verification (runs inside RequestContext ALS scope).
 */
export const createTrustVerificationMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await runTrustVerification(toHttpMessage(req));
      const ctx = req.requestContext?.snapshot;
      if (ctx?.trust) {
        res.setHeader('x-trust-level', ctx.trust.trustLevel);
        if (ctx.trust.verifiedSource) {
          res.setHeader('x-verified-source', ctx.trust.verifiedSource);
        }
      }
      next();
    } catch (error) {
      if (error instanceof TrustBlockedError) {
        res.status(403).json({
          success: false,
          code: 'TRUST_BLOCKED',
          message: 'Request blocked by security policy',
          trustLevel: error.trust.trustLevel,
        });
        return;
      }
      next(error);
    }
  };
};

export const trustVerificationMiddleware = createTrustVerificationMiddleware();
