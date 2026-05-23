export interface TraceInspection {
  requestId: string | null;
  traceId: string | null;
  correlationId: string | null;
  trustLevel: string | null;
  verifiedSource: string | null;
  declaredSource: string | null;
  durationMs: number;
  statusCode: number;
  timestamp: string;
}

const header = (headers: Headers, name: string): string | null => {
  const value = headers.get(name);
  return value && value.trim() ? value.trim() : null;
};

export const inspectResponseTrace = (
  headers: Headers,
  statusCode: number,
  durationMs: number,
): TraceInspection => ({
  requestId: header(headers, 'x-request-id'),
  traceId: header(headers, 'x-trace-id') || header(headers, 'x-correlation-id'),
  correlationId: header(headers, 'x-correlation-id'),
  trustLevel: header(headers, 'x-trust-level'),
  verifiedSource: header(headers, 'x-verified-source'),
  declaredSource: header(headers, 'x-client-source'),
  durationMs,
  statusCode,
  timestamp: new Date().toISOString(),
});
