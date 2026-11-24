import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authConfig } from '../../../config/auth.config';
import {
  evaluateSessionRisk,
  hashDeviceFingerprint,
  ipRangePrefix,
  parseRefreshExpiresInMs,
} from './session-risk.service';

const DAY = 24 * 60 * 60 * 1000;
const BASE = authConfig.session.baseRotationMs;
const SHORT = authConfig.session.shortRotationMs;

const baseSession = (overrides: Record<string, unknown> = {}) => {
  const deviceId = 'device-a';
  const platform = 'android';
  const osVersion = '14';
  return {
    deviceId,
    osVersion,
    deviceFingerprint: hashDeviceFingerprint(deviceId, platform, osVersion),
    lastIpPrefix: '203.0',
    lastGeoCountry: 'IN',
    lastGeoRegion: 'KA',
    biometricFailCount: 0,
    nextRotationAt: new Date(Date.now() + BASE),
    rotationIntervalMs: BASE,
    ...overrides,
  };
};

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  deviceId: 'device-a',
  platform: 'android',
  osVersion: '14',
  ipAddress: '203.0.113.10',
  geoCountry: 'IN',
  geoRegion: 'KA',
  now: new Date('2026-06-15T12:00:00.000Z'), // not unusual hour
  ...overrides,
});

describe('ipRangePrefix', () => {
  it('uses IPv4 /16', () => {
    assert.equal(ipRangePrefix('203.0.113.10'), '203.0');
  });

  it('strips ipv4-mapped ipv6', () => {
    assert.equal(ipRangePrefix('::ffff:203.0.113.10'), '203.0');
  });
});

describe('parseRefreshExpiresInMs', () => {
  it('parses 90d default', () => {
    assert.equal(parseRefreshExpiresInMs(), 90 * DAY);
  });
});

describe('evaluateSessionRisk — baseline', () => {
  it('keeps ~30d baseline with no signals and rotation not due', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput());
    assert.equal(result.rotationIntervalMs, BASE);
    assert.equal(result.forceStepUpNow, false);
    assert.equal(result.preferredStepUp, null);
    assert.deepEqual(result.signals, []);
  });

  it('requests biometric when nextRotationAt is due with no risk', () => {
    const result = evaluateSessionRisk(
      baseSession({ nextRotationAt: new Date('2020-01-01T00:00:00.000Z') }),
      baseInput({ now: new Date('2026-06-15T12:00:00.000Z') }),
    );
    assert.equal(result.forceStepUpNow, true);
    assert.equal(result.preferredStepUp, 'biometric');
    assert.equal(result.rotationIntervalMs, BASE);
  });
});

describe('evaluateSessionRisk — mid-risk → 24h', () => {
  it('shortens on IP /16 change', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput({ ipAddress: '198.51.100.1' }));
    assert.ok(result.signals.includes('ip_range_changed'));
    assert.equal(result.rotationIntervalMs, SHORT);
    assert.equal(result.preferredStepUp, 'biometric');
  });

  it('shortens on geo country change', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput({ geoCountry: 'US' }));
    assert.ok(result.signals.includes('geo_changed'));
    assert.equal(result.rotationIntervalMs, SHORT);
  });

  it('shortens on unusual UTC hour (01–05)', () => {
    const result = evaluateSessionRisk(
      baseSession(),
      baseInput({ now: new Date('2026-06-15T03:00:00.000Z') }),
    );
    assert.ok(result.signals.includes('unusual_hour'));
    assert.equal(result.rotationIntervalMs, SHORT);
  });

  it('halves short window when two mid signals fire (IP + geo; floor 6h)', () => {
    const result = evaluateSessionRisk(
      baseSession(),
      baseInput({ ipAddress: '198.51.100.1', geoCountry: 'US' }),
    );
    assert.ok(result.signals.includes('ip_range_changed'));
    assert.ok(result.signals.includes('geo_changed'));
    assert.equal(result.rotationIntervalMs, Math.max(6 * 60 * 60 * 1000, Math.floor(SHORT / 2)));
  });
});

describe('evaluateSessionRisk — high-risk → force OTP', () => {
  it('forces OTP on device fingerprint change', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput({ deviceId: 'other-device' }));
    assert.ok(result.signals.includes('device_fingerprint_changed'));
    assert.equal(result.forceStepUpNow, true);
    assert.equal(result.preferredStepUp, 'otp');
    assert.equal(result.rotationIntervalMs, authConfig.session.forceStepUpMs);
  });

  it('treats OS version change as high-risk (fingerprint includes OS)', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput({ osVersion: '15' }));
    assert.ok(result.signals.includes('os_version_changed'));
    assert.ok(result.signals.includes('device_fingerprint_changed'));
    assert.equal(result.forceStepUpNow, true);
    assert.equal(result.preferredStepUp, 'otp');
  });

  it('forces OTP on backup restore', () => {
    const result = evaluateSessionRisk(baseSession(), baseInput({ restoredFromBackup: true }));
    assert.ok(result.signals.includes('restored_from_backup'));
    assert.equal(result.forceStepUpNow, true);
    assert.equal(result.preferredStepUp, 'otp');
  });

  it('forces OTP after three biometric failures', () => {
    const result = evaluateSessionRisk(
      baseSession({ biometricFailCount: 2 }),
      baseInput({ biometricFailed: true }),
    );
    assert.ok(result.signals.includes('biometric_failures'));
    assert.equal(result.forceStepUpNow, true);
    assert.equal(result.preferredStepUp, 'otp');
  });

  it('does not force OTP at two biometric failures', () => {
    const result = evaluateSessionRisk(
      baseSession({ biometricFailCount: 1 }),
      baseInput({ biometricFailed: true }),
    );
    assert.equal(result.signals.includes('biometric_failures'), false);
    assert.equal(result.preferredStepUp === 'otp', false);
  });
});
