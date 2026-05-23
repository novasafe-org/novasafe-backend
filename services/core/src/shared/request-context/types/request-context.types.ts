import type { ClientTrustContext } from '../../trust/types';
import type { ClientPlatform, LegacyClientSource, RequestSource } from './request-source.types';

export interface DeviceContext {
  deviceId?: string;
  deviceName?: string;
  deviceModel?: string;
  osVersion?: string;
  userAgent?: string;
}

/** Future: per-platform feature flags (WebAuthn, biometrics, autofill, …). */
export type PlatformCapability =
  | 'biometrics'
  | 'webauthn'
  | 'autofill'
  | 'offline_vault'
  | 'push_notifications'
  | 'file_export';

/** Placeholders for enterprise extensions — not implemented yet. */
export interface RequestContextFlags {
  distributedTracingEnabled?: boolean;
  featureFlags?: Record<string, boolean>;
  riskScore?: number;
  geoCountry?: string;
  geoCity?: string;
}

export interface RequestAuthContext {
  userId?: string;
  tokenId?: string;
  sessionId?: string;
  oauthOtpPending?: boolean;
}

/**
 * Immutable per-request intelligence attached at the edge.
 */
export interface RequestContextData {
  requestId: string;
  traceId: string;
  correlationId?: string;
  /** What the client declared (headers/body) — never trusted for security decisions. */
  declaredSource: RequestSource;
  /** Confirmed source after trust layer; null when unverified. */
  verifiedSource: RequestSource | null;
  /**
   * @deprecated Use `declaredSource` for observability; use `verifiedSource` for authorization.
   * Kept for backward compatibility — equals `declaredSource`.
   */
  source: RequestSource;
  platform: ClientPlatform;
  /** Human-readable log tag from declared source, e.g. `[MOBILE_ANDROID]`. */
  sourceLabel: string;
  /** Value stored on Mongo `source` fields — prefers verified, falls back to declared. */
  legacySource: LegacyClientSource;
  /** Zero-trust evaluation (populated by trust middleware). */
  trust?: ClientTrustContext;
  appVersion?: string;
  buildVersion?: string;
  apiVersion?: string;
  deviceId?: string;
  sessionId?: string;
  userId?: string;
  ip: string;
  userAgent?: string;
  region?: string;
  environment: string;
  tenantId?: string;
  method: string;
  path: string;
  capabilities: PlatformCapability[];
  device: DeviceContext;
  auth: RequestAuthContext;
  flags: RequestContextFlags;
  timestamp: string;
}

/** Framework-agnostic incoming request shape (Express, Fastify, etc.). */
export interface HttpIncomingMessage {
  method: string;
  path: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  remoteAddress?: string;
}

export interface ParsedRequestSource {
  source: RequestSource;
  platform: ClientPlatform;
  legacySource: LegacyClientSource;
  sourceLabel: string;
  capabilities: PlatformCapability[];
}
