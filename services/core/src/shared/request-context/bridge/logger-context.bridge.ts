import type { RequestContextData } from '../types';
import type { RequestContextStore } from '../../logger/core/logger.context';

/** Bridges platform request context into the logging AsyncLocalStorage store. */
export const toLoggerContextStore = (ctx: RequestContextData): RequestContextStore => ({
  requestId: ctx.requestId,
  correlationId: ctx.correlationId ?? ctx.traceId,
  context: ctx.sourceLabel,
  meta: {
    traceId: ctx.traceId,
    declaredSource: ctx.declaredSource,
    verifiedSource: ctx.verifiedSource,
    source: ctx.declaredSource,
    sourceLabel: ctx.sourceLabel,
    platform: ctx.platform,
    legacySource: ctx.legacySource,
    trustLevel: ctx.trust?.trustLevel,
    verificationStatus: ctx.trust?.verificationStatus,
    riskScore: ctx.trust?.device.riskScore,
    appVersion: ctx.appVersion,
    buildVersion: ctx.buildVersion,
    apiVersion: ctx.apiVersion,
    deviceId: ctx.deviceId,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    region: ctx.region,
  },
  request: {
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    method: ctx.method,
    url: ctx.path,
    path: ctx.path,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  },
});
