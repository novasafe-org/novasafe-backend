import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';

export type SessionRiskSignal =
  | 'device_fingerprint_changed'
  | 'os_version_changed'
  | 'ip_range_changed'
  | 'geo_changed'
  | 'biometric_failures'
  | 'restored_from_backup'
  | 'unusual_hour';

export type SessionStepUpMethod = 'biometric' | 'otp' | null;

export interface ISession extends IBaseEntityDocument {
  userId: Types.ObjectId;
  tokenId: string;
  revoked: boolean;
  revokedAt?: Date;
  source?: string;
  ipAddress?: string;
  deviceName?: string;
  platform?: string;
  userAgent?: string;
  locationLabel?: string;
  lastActivity?: Date;
  clientSource?: string;
  declaredSource?: string;
  verifiedSource?: string | null;
  trustLevel?: string;
  clientPlatform?: string;
  legacySource?: string;
  appVersion?: string;
  buildVersion?: string;
  deviceId?: string;
  requestId?: string;
  traceId?: string;
  correlationId?: string;
  sessionId?: string;
  region?: string;
  tenantId?: string;
  /** SHA-256 of opaque refresh token (rotation invalidates previous). */
  refreshTokenHash?: string | null;
  refreshExpiresAt?: Date | null;
  refreshRotatedAt?: Date | null;
  /** deviceId|platform|osVersion fingerprint at issue time. */
  deviceFingerprint?: string | null;
  osVersion?: string | null;
  lastIpPrefix?: string | null;
  lastGeoCountry?: string | null;
  lastGeoRegion?: string | null;
  biometricFailCount?: number;
  rotationIntervalMs?: number;
  nextRotationAt?: Date | null;
  riskSignals?: SessionRiskSignal[];
  preferredStepUp?: SessionStepUpMethod;
}
