import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { JwtTokenService } from './jwt.token.service';

describe('JwtTokenService refresh tokens', () => {
  before(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-for-session-auth-unit-tests';
    }
  });

  it('issues opaque refresh tokens with matching SHA-256 hash', () => {
    const tokens = new JwtTokenService();
    const pack = tokens.generateRefreshToken();
    assert.ok(pack.token.length > 32);
    assert.equal(pack.tokenHash, crypto.createHash('sha256').update(pack.token).digest('hex'));
    assert.equal(tokens.hashRefreshToken(pack.token), pack.tokenHash);
  });

  it('new refresh tokens are unique (rotation invalidates by new hash)', () => {
    const tokens = new JwtTokenService();
    const a = tokens.generateRefreshToken();
    const b = tokens.generateRefreshToken();
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.tokenHash, b.tokenHash);
  });

  it('old refresh hash does not match new token after rotation', () => {
    const tokens = new JwtTokenService();
    const oldPack = tokens.generateRefreshToken();
    const newPack = tokens.generateRefreshToken();
    assert.notEqual(tokens.hashRefreshToken(oldPack.token), newPack.tokenHash);
  });
});
