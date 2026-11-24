import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OtpPurpose } from './auth.enums';

describe('OtpPurpose.SessionStepUp', () => {
  it('is registered for session OTP fallback emails', () => {
    assert.equal(OtpPurpose.SessionStepUp, 'session_step_up');
    assert.ok(Object.values(OtpPurpose).includes(OtpPurpose.SessionStepUp));
  });
});
