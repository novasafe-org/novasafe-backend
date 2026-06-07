import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactPasswordVersionsForEntitlement } from './password-version-access';

describe('redactPasswordVersionsForEntitlement', () => {
  const versions = [
    {
      id: 'v1',
      credential_id: 'c1',
      password: 'current-secret',
      is_expired: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: 'v2',
      credential_id: 'c1',
      password: 'old-secret',
      is_expired: true,
      created_at: '2025-06-01',
      updated_at: '2025-06-01',
    },
  ];

  it('returns full versions for entitled users', () => {
    const result = redactPasswordVersionsForEntitlement(versions, true);
    assert.equal(result.length, 2);
    assert.equal(result[0].password, 'current-secret');
    assert.equal(result[1].password, 'old-secret');
  });

  it('strips password field for free users (metadata-only)', () => {
    const result = redactPasswordVersionsForEntitlement(versions, false);
    assert.equal(result.length, 2);
    assert.equal('password' in result[0], false);
    assert.equal('password' in result[1], false);
    assert.equal(result[0].id, 'v1');
    assert.equal(result[0].is_expired, false);
    assert.equal(result[1].id, 'v2');
    assert.equal(result[1].is_expired, true);
  });

  it('returns empty array unchanged', () => {
    const result = redactPasswordVersionsForEntitlement([], false);
    assert.deepEqual(result, []);
  });
});
