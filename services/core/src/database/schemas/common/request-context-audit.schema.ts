/**
 * Reusable request-context fields for audit, sessions, and security collections.
 */
export const requestContextAuditFields = {
  requestId: { type: String, default: null },
  traceId: { type: String, default: null },
  correlationId: { type: String, default: null },
  clientSource: { type: String, default: null },
  clientPlatform: { type: String, default: null },
  legacySource: { type: String, default: null },
  appVersion: { type: String, default: null },
  buildVersion: { type: String, default: null },
  apiVersion: { type: String, default: null },
  deviceId: { type: String, default: null },
  sessionId: { type: String, default: null },
  region: { type: String, default: null },
  tenantId: { type: String, default: null },
  declaredSource: { type: String, default: null },
  verifiedSource: { type: String, default: null },
  trustLevel: { type: String, default: null },
  verificationStatus: { type: String, default: null },
  verificationMethods: { type: [String], default: [] },
  replayDetected: { type: Boolean, default: false },
  suspiciousActivity: { type: Boolean, default: false },
  riskScore: { type: Number, default: null },
} as const;
