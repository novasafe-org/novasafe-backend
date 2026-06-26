import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AuthResponseService } from './auth-response.service';

describe('AuthResponseService.randomOtp', () => {
  it('returns a 6-digit string', () => {
    const code = AuthResponseService.randomOtp();
    assert.match(code, /^\d{6}$/);
  });

  it('uses crypto.randomInt (not Math.random)', () => {
    const original = crypto.randomInt;
    let called = false;
    crypto.randomInt = ((min: number, max: number) => {
      called = true;
      assert.equal(min, 100_000);
      assert.equal(max, 1_000_000);
      return 424242;
    }) as typeof crypto.randomInt;
    try {
      assert.equal(AuthResponseService.randomOtp(), '424242');
      assert.equal(called, true);
    } finally {
      crypto.randomInt = original;
    }
  });
});
