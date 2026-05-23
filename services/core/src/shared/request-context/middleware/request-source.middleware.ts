import type { HttpIncomingMessage, RequestContextData } from '../types';
import {
  parseDeviceContext,
  parseRequestSource,
  resolveClientIp,
} from '../utils';
import { extractHeaderString } from '../utils/trace.util';
import { REQUEST_CONTEXT_HEADERS } from '../constants';

export interface BuildRequestContextInput {
  message: HttpIncomingMessage;
  trace: { requestId: string; traceId: string; correlationId?: string };
  environment?: string;
}

/**
 * Builds the full RequestContextData object from an HTTP message.
 */
export const buildRequestContextData = (input: BuildRequestContextInput): RequestContextData => {
  const { message, trace, environment = process.env.NODE_ENV || 'development' } = input;
  const parsed = parseRequestSource(message);
  const device = parseDeviceContext(message);
  const headers = message.headers;

  const appVersion =
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CLIENT_VERSION) ||
    undefined;
  const buildVersion = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.BUILD_VERSION);
  const apiVersion = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.API_VERSION);
  const deviceId =
    device.deviceId || extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.DEVICE_ID);
  const sessionId = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.SESSION_ID);
  const region = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.REGION);
  const tenantId = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.TENANT);

  const declaredSource = parsed.source;

  return {
    requestId: trace.requestId,
    traceId: trace.traceId,
    correlationId: trace.correlationId,
    declaredSource,
    verifiedSource: null,
    source: declaredSource,
    platform: parsed.platform,
    sourceLabel: parsed.sourceLabel,
    legacySource: parsed.legacySource,
    appVersion,
    buildVersion,
    apiVersion,
    deviceId,
    sessionId,
    ip: resolveClientIp(message),
    userAgent: device.userAgent,
    region,
    environment,
    tenantId,
    method: message.method,
    path: message.originalUrl || message.path,
    capabilities: parsed.capabilities,
    device,
    auth: { sessionId },
    flags: {},
    timestamp: new Date().toISOString(),
  };
};
