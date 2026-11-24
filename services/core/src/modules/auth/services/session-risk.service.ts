import crypto from 'node:crypto';
import { authConfig } from '../../../config/auth.config';
import type { ISession, SessionRiskSignal, SessionStepUpMethod } from '../../../database/schemas/sessions/session.interface';

export type SessionRiskInput = {
  deviceId: string;
  platform: string;
  osVersion: string;
  ipAddress: string;
  geoCountry?: string | null;
  geoRegion?: string | null;
  restoredFromBackup?: boolean;
  biometricFailed?: boolean;
  now?: Date;
};

export type SessionRiskResult = {
  signals: SessionRiskSignal[];
  rotationIntervalMs: number;
  nextRotationAt: Date;
  preferredStepUp: SessionStepUpMethod;
  forceStepUpNow: boolean;
};

export const hashDeviceFingerprint = (deviceId: string, platform: string, osVersion: string): string =>
  crypto.createHash('sha256').update(`${deviceId}|${platform}|${osVersion}`).digest('hex');

/** Coarse IP range: IPv4 /16, else first colon-group for IPv6-ish. */
export const ipRangePrefix = (ip: string): string => {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (v4) return `${v4[1]}.${v4[2]}`;
  const cleaned = ip.replace(/^::ffff:/, '');
  const v4mapped = cleaned.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (v4mapped) return `${v4mapped[1]}.${v4mapped[2]}`;
  const parts = ip.split(':').filter(Boolean);
  return parts.slice(0, 2).join(':') || ip.slice(0, 16);
};

const unusualHour = (now: Date): boolean => {
  const hour = now.getUTCHours();
  return hour >= 1 && hour <= 5;
};

/**
 * Adaptive rotation: start from base interval; each signal shortens.
 * High-severity signals (backup restore, biometric failures, device change) force OTP step-up.
 */
export const evaluateSessionRisk = (
  session: Pick<
    ISession,
    | 'deviceFingerprint'
    | 'deviceId'
    | 'osVersion'
    | 'lastIpPrefix'
    | 'lastGeoCountry'
    | 'lastGeoRegion'
    | 'biometricFailCount'
    | 'nextRotationAt'
    | 'rotationIntervalMs'
  >,
  input: SessionRiskInput,
): SessionRiskResult => {
  const now = input.now ?? new Date();
  const signals: SessionRiskSignal[] = [];
  const fingerprint = hashDeviceFingerprint(input.deviceId, input.platform, input.osVersion);
  const prefix = ipRangePrefix(input.ipAddress);

  if (session.deviceFingerprint && session.deviceFingerprint !== fingerprint) {
    signals.push('device_fingerprint_changed');
  } else if (session.deviceId && session.deviceId !== input.deviceId) {
    signals.push('device_fingerprint_changed');
  }

  if (session.osVersion && input.osVersion && session.osVersion !== input.osVersion) {
    signals.push('os_version_changed');
  }

  if (session.lastIpPrefix && session.lastIpPrefix !== prefix) {
    signals.push('ip_range_changed');
  }

  const country = (input.geoCountry || '').trim().toUpperCase();
  const region = (input.geoRegion || '').trim().toUpperCase();
  if (session.lastGeoCountry && country && session.lastGeoCountry !== country) {
    signals.push('geo_changed');
  } else if (session.lastGeoRegion && region && session.lastGeoRegion !== region) {
    signals.push('geo_changed');
  }

  const failCount = Number(session.biometricFailCount || 0) + (input.biometricFailed ? 1 : 0);
  if (failCount >= authConfig.session.biometricFailForceOtp) {
    signals.push('biometric_failures');
  }

  if (input.restoredFromBackup) {
    signals.push('restored_from_backup');
  }

  if (unusualHour(now)) {
    signals.push('unusual_hour');
  }

  const highSeverity =
    signals.includes('restored_from_backup') ||
    signals.includes('biometric_failures') ||
    signals.includes('device_fingerprint_changed');

  const midSeverity =
    signals.includes('geo_changed') ||
    signals.includes('os_version_changed') ||
    signals.includes('ip_range_changed');

  let rotationIntervalMs = authConfig.session.baseRotationMs;
  let preferredStepUp: SessionStepUpMethod = 'biometric';
  let forceStepUpNow = false;

  if (highSeverity) {
    rotationIntervalMs = authConfig.session.forceStepUpMs;
    preferredStepUp = 'otp';
    forceStepUpNow = true;
  } else if (midSeverity || signals.includes('unusual_hour')) {
    rotationIntervalMs = authConfig.session.shortRotationMs;
    preferredStepUp = 'biometric';
    const due = session.nextRotationAt ? new Date(session.nextRotationAt).getTime() <= now.getTime() : false;
    forceStepUpNow = due;
  } else {
    const due = session.nextRotationAt ? new Date(session.nextRotationAt).getTime() <= now.getTime() : false;
    forceStepUpNow = due;
    preferredStepUp = due ? 'biometric' : null;
  }

  // Multiple mid signals stack: halve short window once more (floor 6h).
  if (!highSeverity && signals.filter((s) => s !== 'unusual_hour').length >= 2) {
    rotationIntervalMs = Math.max(6 * 60 * 60 * 1000, Math.floor(authConfig.session.shortRotationMs / 2));
  }

  const nextRotationAt = new Date(now.getTime() + Math.max(rotationIntervalMs, 0));

  return {
    signals,
    rotationIntervalMs,
    nextRotationAt,
    preferredStepUp: forceStepUpNow ? preferredStepUp || 'biometric' : preferredStepUp,
    forceStepUpNow,
  };
};

export const parseRefreshExpiresInMs = (): number => {
  const raw = authConfig.jwt.refreshExpiresIn;
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 90 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2]) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return 90 * 24 * 60 * 60 * 1000;
  }
};
