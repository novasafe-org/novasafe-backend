import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { JwtTokenService } from '../tokens/jwt.token.service';
import { TokenRefreshService } from './token-refresh.service';
import { hashDeviceFingerprint } from './session-risk.service';

const deviceId = 'bound-device-1';
const platform = 'android';
const osVersion = '14';

function mockReq(overrides: { deviceId?: string; body?: Record<string, unknown> } = {}): Request {
  const id = overrides.deviceId ?? deviceId;
  return {
    headers: {
      'x-device-id': id,
      'user-agent': 'NovaSafeTest/1.0',
      'x-client-region': 'KA',
      'x-client-country': 'IN',
    },
    body: {
      devicePlatform: platform,
      deviceModel: 'Pixel',
      deviceOsVersion: osVersion,
      ...(overrides.body || {}),
    },
    source: 'mobile',
    socket: { remoteAddress: '203.0.113.10' },
  } as unknown as Request;
}

describe('TokenRefreshService', () => {
  before(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-for-session-auth-unit-tests';
    }
  });

  const tokens = new JwtTokenService();

  const makeSession = (refreshToken: string, overrides: Record<string, unknown> = {}) => {
    const packHash = tokens.hashRefreshToken(refreshToken);
    return {
      userId: new ObjectId(),
      tokenId: 'access-jti-1',
      revoked: false,
      deviceId,
      platform,
      osVersion,
      deviceFingerprint: hashDeviceFingerprint(deviceId, platform, osVersion),
      refreshTokenHash: packHash,
      refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      lastIpPrefix: '203.0',
      lastGeoCountry: 'IN',
      lastGeoRegion: 'KA',
      biometricFailCount: 0,
      nextRotationAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      rotationIntervalMs: 30 * 24 * 60 * 60 * 1000,
      ...overrides,
    };
  };

  const makeUser = (userId: ObjectId) => ({
    _id: userId,
    email: 'user@example.com',
    name: 'Test User',
    picture: null,
    avatar_url: null,
  });

  it('rejects non-mobile clients', async () => {
    const service = new TokenRefreshService({} as never, {} as never, tokens);
    const webReq = mockReq();
    (webReq.headers as Record<string, string>)['x-client-source'] = 'WEB_APP';
    (webReq.body as Record<string, string>).devicePlatform = 'web';
    const result = await service.refresh(webReq, { refreshToken: 'anything' });
    assert.equal(result.status, 403);
    assert.equal((result.body as { code?: string }).code, 'MOBILE_ONLY');
  });

  it('rejects missing refresh token', async () => {
    const service = new TokenRefreshService(
      {} as never,
      {} as never,
      tokens,
    );
    const result = await service.refresh(mockReq(), {});
    assert.equal(result.status, 400);
  });

  it('rejects unknown / invalidated refresh token', async () => {
    const sessions = {
      findActiveByRefreshHash: async () => null,
    };
    const service = new TokenRefreshService(sessions as never, {} as never, tokens);
    const result = await service.refresh(mockReq(), { refreshToken: 'stale-token' });
    assert.equal(result.status, 401);
    assert.equal((result.body as { code?: string }).code, 'INVALID_REFRESH_TOKEN');
  });

  it('rejects refresh from a different device (device binding)', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const session = makeSession(refresh);
    const sessions = {
      findActiveByRefreshHash: async () => session,
      incrementBiometricFail: async () => 1,
    };
    const service = new TokenRefreshService(sessions as never, {} as never, tokens);
    const result = await service.refresh(mockReq({ deviceId: 'other-device' }), {
      refreshToken: refresh,
    });
    assert.equal(result.status, 401);
    assert.equal((result.body as { code?: string }).code, 'DEVICE_BINDING_MISMATCH');
  });

  it('silently rotates tokens when risk is low and rotation not due', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const session = makeSession(refresh);
    const user = makeUser(session.userId as ObjectId);
    let rotated = false;
    let previousTokenId: string | undefined;
    const sessions = {
      findActiveByRefreshHash: async () => session,
      rotateTokens: async (prev: string) => {
        rotated = true;
        previousTokenId = prev;
      },
      resetBiometricFail: async () => undefined,
      incrementBiometricFail: async () => 0,
    };
    const users = {
      findByIdActive: async () => user,
    };
    const service = new TokenRefreshService(sessions as never, users as never, tokens);
    const result = await service.refresh(mockReq(), { refreshToken: refresh });
    assert.equal(result.status, 200);
    const body = result.body as {
      success: boolean;
      accessToken: string;
      refreshToken: string;
      token: string;
    };
    assert.equal(body.success, true);
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);
    assert.notEqual(body.refreshToken, refresh);
    assert.equal(rotated, true);
    assert.equal(previousTokenId, 'access-jti-1');
  });

  it('requires biometric step-up when rotation is due', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const session = makeSession(refresh, {
      nextRotationAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const user = makeUser(session.userId as ObjectId);
    const sessions = {
      findActiveByRefreshHash: async () => session,
      incrementBiometricFail: async () => 0,
    };
    const users = { findByIdActive: async () => user };
    const service = new TokenRefreshService(sessions as never, users as never, tokens);
    const blocked = await service.refresh(mockReq(), { refreshToken: refresh });
    assert.equal(blocked.status, 403);
    assert.equal((blocked.body as { code?: string }).code, 'SESSION_STEP_UP_REQUIRED');
    assert.equal((blocked.body as { preferredStepUp?: string }).preferredStepUp, 'biometric');

    let rotated = false;
    const sessions2 = {
      findActiveByRefreshHash: async () => session,
      rotateTokens: async () => {
        rotated = true;
      },
      resetBiometricFail: async () => undefined,
      incrementBiometricFail: async () => 0,
    };
    const service2 = new TokenRefreshService(sessions2 as never, users as never, tokens);
    const ok = await service2.refresh(mockReq(), {
      refreshToken: refresh,
      stepUpMethod: 'biometric',
    });
    assert.equal(ok.status, 200);
    assert.equal(rotated, true);
  });

  it('forces OTP preference on backup restore / high risk', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const session = makeSession(refresh);
    const user = makeUser(session.userId as ObjectId);
    const sessions = {
      findActiveByRefreshHash: async () => session,
      incrementBiometricFail: async () => 0,
    };
    const users = { findByIdActive: async () => user };
    const service = new TokenRefreshService(sessions as never, users as never, tokens);
    const result = await service.refresh(mockReq(), {
      refreshToken: refresh,
      restoredFromBackup: true,
    });
    assert.equal(result.status, 403);
    assert.equal((result.body as { preferredStepUp?: string }).preferredStepUp, 'otp');
  });

  it('reports biometricFailed and still allows OTP step-up path', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const session = makeSession(refresh, { biometricFailCount: 2 });
    const user = makeUser(session.userId as ObjectId);
    let failBumps = 0;
    const sessions = {
      findActiveByRefreshHash: async () => session,
      incrementBiometricFail: async () => {
        failBumps += 1;
        return 3;
      },
    };
    const users = { findByIdActive: async () => user };
    const service = new TokenRefreshService(sessions as never, users as never, tokens);
    const result = await service.refresh(mockReq(), {
      refreshToken: refresh,
      biometricFailed: true,
    });
    assert.equal(failBumps, 1);
    assert.equal(result.status, 403);
    assert.equal((result.body as { preferredStepUp?: string }).preferredStepUp, 'otp');
  });
});
