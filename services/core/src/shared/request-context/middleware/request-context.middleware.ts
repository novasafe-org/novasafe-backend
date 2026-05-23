import type { NextFunction, Request, Response } from 'express';
import { LoggerContext } from '../../logger/core/logger.context';
import { toLoggerContextStore } from '../bridge/logger-context.bridge';
import { RequestContextManager } from '../context';
import type { HttpIncomingMessage } from '../types';
import {
  runTrustVerification,
  TrustBlockedError,
} from '../../trust/middleware/trust-verification.middleware';
import { buildRequestContextData } from './request-source.middleware';
import { resolveRequestTrace } from './request-trace.middleware';

declare global {
  namespace Express {
    interface Request {
      /** Full platform request intelligence (preferred). */
      requestContext?: import('../context/request-context').RequestContext;
      /** @deprecated Use `requestContext.legacySource` — kept for mobile_vault response compatibility. */
      source?: string;
      tenant?: string;
    }
  }
}

const toHttpMessage = (req: Request): HttpIncomingMessage => ({
  method: req.method,
  path: req.path,
  originalUrl: req.originalUrl,
  headers: req.headers as HttpIncomingMessage['headers'],
  body: req.body,
  remoteAddress: req.socket.remoteAddress,
});

/**
 * Central request context middleware: trace IDs, source/platform, ALS scope, logger bridge.
 */
export const createRequestContextMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const message = toHttpMessage(req);
    const trace = resolveRequestTrace(message);
    const contextData = buildRequestContextData({ message, trace });

    res.setHeader('x-request-id', contextData.requestId);
    res.setHeader('x-trace-id', contextData.traceId);
    if (contextData.correlationId) {
      res.setHeader('x-correlation-id', contextData.correlationId);
    }

    req.source = contextData.legacySource;
    if (contextData.tenantId) {
      req.tenant = contextData.tenantId;
    }

    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.source = contextData.legacySource;
      if (!req.body.devicePlatform && contextData.platform) {
        req.body.devicePlatform = contextData.platform;
      }
    }

    const runHandler = async (): Promise<void> => {
      try {
        await runTrustVerification(message);
        const latest = RequestContextManager.getData() ?? contextData;
        if (latest.trust) {
          res.setHeader('x-trust-level', latest.trust.trustLevel);
          if (latest.verifiedSource) {
            res.setHeader('x-verified-source', latest.verifiedSource);
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

    RequestContextManager.run(contextData, () => {
      const ctx = RequestContextManager.get();
      if (ctx) req.requestContext = ctx;
      LoggerContext.run(toLoggerContextStore(contextData), () => {
        void runHandler();
      });
    });
  };
};

export const requestContextMiddleware = createRequestContextMiddleware();
