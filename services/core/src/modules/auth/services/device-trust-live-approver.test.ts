import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import {
  LIVE_APPROVER_MAX_IDLE_MS,
  meetsLiveApproverCriteria,
} from './device-trust.service';

describe('meetsLiveApproverCriteria', () => {
  const now = Date.parse('2026-03-27T12:00:00.000Z');

  it('rejects stale lastSeen even with a push token and live session', () => {
    assert.equal(
      meetsLiveApproverCriteria({
        lastSeenAt: new Date(now - LIVE_APPROVER_MAX_IDLE_MS - 1),
        pushToken: 'fcm-token',
        sessionExists: true,
        sessionLastActivity: new Date(now - 60_000),
        now,
      }),
      false,
    );
  });

  it('rejects missing push token even with recent activity', () => {
    assert.equal(
      meetsLiveApproverCriteria({
        lastSeenAt: new Date(now - 60_000),
        pushToken: null,
        sessionExists: true,
        sessionLastActivity: new Date(now - 60_000),
        now,
      }),
      false,
    );
  });

  it('rejects non-revoked but idle sessions', () => {
    assert.equal(
      meetsLiveApproverCriteria({
        lastSeenAt: new Date(now - 60_000),
        pushToken: 'fcm-token',
        sessionExists: true,
        sessionLastActivity: new Date(now - LIVE_APPROVER_MAX_IDLE_MS - 1),
        now,
      }),
      false,
    );
  });

  it('rejects when there is no session at all', () => {
    assert.equal(
      meetsLiveApproverCriteria({
        lastSeenAt: new Date(now - 60_000),
        pushToken: 'fcm-token',
        sessionExists: false,
        sessionLastActivity: null,
        now,
      }),
      false,
    );
  });

  it('accepts recent lastSeen + push token + recent session activity', () => {
    assert.equal(
      meetsLiveApproverCriteria({
        lastSeenAt: new Date(now - 60_000),
        pushToken: 'fcm-token',
        sessionExists: true,
        sessionLastActivity: new Date(now - 30_000),
        now,
      }),
      true,
    );
  });
});

describe('DeviceLoginApproval OTP purpose', () => {
  it('exposes DeviceLoginApproval for schema/enum coverage', () => {
    assert.equal(OtpPurpose.DeviceLoginApproval, 'device_login_approval');
  });
});
