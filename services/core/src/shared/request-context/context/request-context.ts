import type { RequestContextData } from '../types';

/**
 * Facade over immutable request context data.
 */
export class RequestContext {
  constructor(private readonly data: RequestContextData) {}

  get snapshot(): Readonly<RequestContextData> {
    return this.data;
  }

  get requestId(): string {
    return this.data.requestId;
  }

  get traceId(): string {
    return this.data.traceId;
  }

  get sourceLabel(): string {
    return this.data.sourceLabel;
  }

  get legacySource(): string {
    return this.data.legacySource;
  }

  get declaredSource(): string {
    return this.data.declaredSource;
  }

  get verifiedSource(): string | null {
    return this.data.verifiedSource;
  }

  get trustLevel(): string | undefined {
    return this.data.trust?.trustLevel;
  }

  /** Fields safe to persist on audit / session documents. */
  toAuditFields(): Record<string, unknown> {
    const trust = this.data.trust;
    return {
      requestId: this.data.requestId,
      traceId: this.data.traceId,
      correlationId: this.data.correlationId,
      declaredSource: this.data.declaredSource,
      verifiedSource: this.data.verifiedSource,
      clientSource: this.data.verifiedSource ?? this.data.declaredSource,
      clientPlatform: this.data.platform,
      legacySource: this.data.legacySource,
      trustLevel: trust?.trustLevel,
      verificationStatus: trust?.verificationStatus,
      verificationMethods: trust?.verificationMethods,
      replayDetected: trust?.replay.replayDetected ?? false,
      suspiciousActivity: trust?.trustLevel === 'SUSPICIOUS' || trust?.trustLevel === 'BLOCKED',
      riskScore: trust?.device.riskScore,
      appVersion: this.data.appVersion,
      buildVersion: this.data.buildVersion,
      apiVersion: this.data.apiVersion,
      deviceId: this.data.deviceId,
      sessionId: this.data.sessionId || this.data.auth.sessionId,
      userId: this.data.userId || this.data.auth.userId,
      ipAddress: this.data.ip,
      userAgent: this.data.userAgent,
      region: this.data.region,
      tenantId: this.data.tenantId,
      capabilities: this.data.capabilities,
      device: this.data.device,
    };
  }

  /** Session creation payload enrichment. */
  toSessionFields(): Record<string, unknown> {
    const effective = this.data.verifiedSource ?? this.data.declaredSource;
    return {
      source: this.data.legacySource,
      clientSource: effective,
      declaredSource: this.data.declaredSource,
      verifiedSource: this.data.verifiedSource,
      trustLevel: this.data.trust?.trustLevel,
      clientPlatform: this.data.platform,
      appVersion: this.data.appVersion,
      buildVersion: this.data.buildVersion,
      deviceId: this.data.deviceId,
      requestId: this.data.requestId,
      traceId: this.data.traceId,
      ipAddress: this.data.ip,
      deviceName: this.data.device.deviceName,
      platform: this.data.device.deviceModel
        ? this.data.platform
        : this.data.platform,
      userAgent: this.data.userAgent,
    };
  }

  /** Automatic logger metadata enrichment. */
  toLogMeta(): Record<string, unknown> {
    const trust = this.data.trust;
    return {
      requestId: this.data.requestId,
      traceId: this.data.traceId,
      correlationId: this.data.correlationId,
      declaredSource: this.data.declaredSource,
      verifiedSource: this.data.verifiedSource,
      source: this.data.declaredSource,
      sourceLabel: this.data.sourceLabel,
      platform: this.data.platform,
      legacySource: this.data.legacySource,
      trustLevel: trust?.trustLevel,
      verificationStatus: trust?.verificationStatus,
      riskScore: trust?.device.riskScore,
      appVersion: this.data.appVersion,
      buildVersion: this.data.buildVersion,
      apiVersion: this.data.apiVersion,
      deviceId: this.data.deviceId,
      sessionId: this.data.sessionId,
      userId: this.data.userId,
      tenantId: this.data.tenantId,
      region: this.data.region,
    };
  }
}
