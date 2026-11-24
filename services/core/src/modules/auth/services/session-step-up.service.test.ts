import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { JwtTokenService } from '../tokens/jwt.token.service';
import { SessionStepUpService } from './session-step-up.service';

const deviceId = 'bound-device-1';

function mockReq(): Request {
  return {
    headers: { 'x-device-id': deviceId, 'user-agent': 'NovaSafeTest/1.0' },
    body: { devicePlatform: 'android', deviceModel: 'Pixel', deviceOsVersion: '14' },
    source: 'mobile',
    socket: { remoteAddress: '203.0.113.10' },
  } as unknown as Request;
}

describe('SessionStepUpService', () => {
  before(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-for-session-auth-unit-tests';
    }
  });

  const tokens = new JwtTokenService();

  it('exposes SessionStepUp OTP purpose for schema/enum coverage', () => {
    assert.equal(OtpPurpose.SessionStepUp, 'session_step_up');
  });

  it('rejects request-otp without refresh token', async () => {
    const service = new SessionStepUpService(
      {} as never,
      {} as never,
      tokens,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.requestOtp(mockReq(), '');
    assert.equal(result.status, 400);
  });

  it('rejects request-otp when refresh is unknown', async () => {
    const sessions = { findActiveByRefreshHash: async () => null };
    const service = new SessionStepUpService(
      sessions as never,
      {} as never,
      tokens,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.requestOtp(mockReq(), 'missing');
    assert.equal(result.status, 401);
  });

  it('rejects request-otp on device binding mismatch', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const sessions = {
      findActiveByRefreshHash: async () => ({
        userId: new ObjectId(),
        deviceId: 'other-device',
        tokenId: 't1',
      }),
    };
    const service = new SessionStepUpService(
      sessions as never,
      {} as never,
      tokens,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.requestOtp(mockReq(), refresh);
    assert.equal(result.status, 401);
    assert.equal((result.body as { code?: string }).code, 'DEVICE_BINDING_MISMATCH');
  });

  it('verify-otp rejects bad code and accepts matching code via refresh rotation', async () => {
    const refresh = tokens.generateRefreshToken().token;
    const userId = new ObjectId();
    const sessions = {
      findActiveByRefreshHash: async () => ({
        userId,
        deviceId,
        tokenId: 't1',
      }),
    };
    const users = {
      findByIdActive: async () => ({ _id: userId, email: 'user@example.com' }),
    };
    const otpRepo = {
      findValid: async () => ({ _id: 'otp1', code: '123456', verifyAttempts: 0 }),
      incrementAttempts: async () => undefined,
      deleteByEmailPurpose: async () => undefined,
    };
    let refreshedWithOtp = false;
    const refreshSvc = {
      refresh: async (_req: Request, body: { stepUpMethod?: string }) => {
        refreshedWithOtp = body.stepUpMethod === 'otp';
        return {
          status: 200,
          body: {
            success: true,
            token: 'new-access',
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
          },
        };
      },
    };

    const badRepo = {
      ...otpRepo,
      findValid: async () => ({ _id: 'otp1', code: '999999', verifyAttempts: 0 }),
    };
    const badService = new SessionStepUpService(
      sessions as never,
      users as never,
      tokens,
      {} as never,
      badRepo as never,
      refreshSvc as never,
    );
    const bad = await badService.verifyOtp(mockReq(), refresh, '123456');
    assert.equal(bad.status, 400);

    const goodService = new SessionStepUpService(
      sessions as never,
      users as never,
      tokens,
      {} as never,
      otpRepo as never,
      refreshSvc as never,
    );
    const good = await goodService.verifyOtp(mockReq(), refresh, '123456');
    assert.equal(good.status, 200);
    assert.equal(refreshedWithOtp, true);
    assert.equal((good.body as { refreshToken?: string }).refreshToken, 'new-refresh');
  });
});
