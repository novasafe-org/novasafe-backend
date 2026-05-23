import { v4 as uuidv4 } from 'uuid';
import { REQUEST_CONTEXT_HEADERS, REQUEST_CONTEXT_LIMITS } from '../constants';

const sanitizeId = (value: string): string =>
  value.trim().slice(0, REQUEST_CONTEXT_LIMITS.MAX_HEADER_VALUE_LENGTH);

export const generateRequestId = (): string => uuidv4();

export const generateTraceId = (): string => uuidv4();

export const extractHeaderString = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined => {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (typeof raw === 'string' && raw.trim()) return sanitizeId(raw);
  if (Array.isArray(raw) && raw[0]) return sanitizeId(String(raw[0]));
  return undefined;
};

export interface ResolvedTraceIds {
  requestId: string;
  traceId: string;
  correlationId?: string;
}

/** Resolves traceability IDs from headers or generates new ones. */
export const resolveTraceIds = (
  headers: Record<string, string | string[] | undefined>,
): ResolvedTraceIds => {
  const requestId =
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.REQUEST_ID) ||
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CORRELATION_ID) ||
    generateRequestId();

  const traceId =
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.TRACE_ID) ||
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CORRELATION_ID) ||
    requestId;

  const correlationId =
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CORRELATION_ID) || traceId;

  return { requestId, traceId, correlationId };
};
