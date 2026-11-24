import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import {
  DeviceAttestationService,
  setDeviceAttestationServiceForTests,
  type AttestationEnvelope,
} from './device-attestation.service';
import { TokenRefreshService } from './token-refresh.service';
import { JwtTokenService } from '../tokens/jwt.token.service';

const encodeEnvelope = (env: AttestationEnvelope): string =>
  Buffer.from(JSON.stringify(env), 'utf8').toString('base64url');

const mobileReq = (attestation?: string): Request =>
  ({
    headers: {
      'x-client-source': 'MOBILE_ANDROID',
      'x-device-id': 'dev-1',
      ...(attestation ? { 'x-device-attestation': attestation } : {}),
    },
    body: { devicePlatform: 'android' },
    source: 'mobile',
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as Request;

const webReq = (): Request =>
  ({
    headers: { 'x-client-source': 'WEB_APP' },
    body: { devicePlatform: 'web' },
    source: 'web',
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as Request;

describe('DeviceAttestationService', () => {
  let previousMode: string | undefined;

  before(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-for-device-attestation';
    }
    previousMode = process.env.DEVICE_ATTESTATION_MODE;
  });

  afterEach(() => {
    if (previousMode === undefined) delete process.env.DEVICE_ATTESTATION_MODE;
    else process.env.DEVICE_ATTESTATION_MODE = previousMode;
    setDeviceAttestationServiceForTests(null);
  });

  it('accepts valid mock attestation when mode=mock', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    const service = new DeviceAttestationService();
    const token = encodeEnvelope({
      v: 1,
      platform: 'android',
      provider: 'mock',
      token: 'novasafe-mock-attest:valid:device-1',
    });
    const result = await service.assertForMobileSession(mobileReq(token));
    assert.ok(result);
    assert.equal(result.ok, true);
  });

  it('rejects missing attestation when mode=mock', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    const service = new DeviceAttestationService();
    const result = await service.assertForMobileSession(mobileReq());
    assert.ok(result);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'ATTESTATION_REQUIRED');
  });

  it('rejects invalid attestation when mode=mock', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    const service = new DeviceAttestationService();
    const token = encodeEnvelope({
      v: 1,
      platform: 'android',
      provider: 'mock',
      token: 'novasafe-mock-attest:invalid',
    });
    const result = await service.assertForMobileSession(mobileReq(token));
    assert.ok(result);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'ATTESTATION_INVALID');
  });

  it('web client is unaffected (no attestation required / null gate)', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    const service = new DeviceAttestationService();
    const result = await service.assertForMobileSession(webReq());
    assert.equal(result, null);
  });

  it('enforce mode accepts Play Integrity when decoder returns recognized app', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'enforce';
    const service = new DeviceAttestationService(async () => ({
      packageName: 'io.novasafe.mobile',
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      certificateSha256Digest: ['abc'],
      deviceIntegrityVerdicts: ['MEETS_DEVICE_INTEGRITY'],
    }));
    const token = encodeEnvelope({
      v: 1,
      platform: 'android',
      provider: 'play_integrity',
      token: 'fake-integrity-jwt',
    });
    const result = await service.assertForMobileSession(mobileReq(token));
    assert.ok(result?.ok);
  });

  it('enforce mode rejects Play Integrity with bad package name', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'enforce';
    const service = new DeviceAttestationService(async () => ({
      packageName: 'com.attacker.fake',
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      deviceIntegrityVerdicts: ['MEETS_DEVICE_INTEGRITY'],
    }));
    const token = encodeEnvelope({
      v: 1,
      platform: 'android',
      provider: 'play_integrity',
      token: 'fake-integrity-jwt',
    });
    const result = await service.assertForMobileSession(mobileReq(token));
    assert.ok(result);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'ATTESTATION_INVALID');
  });

  it('refresh rejects mobile client without attestation when mode=mock', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    setDeviceAttestationServiceForTests(new DeviceAttestationService());
    const tokens = new JwtTokenService();
    const refresh = new TokenRefreshService({} as never, {} as never, tokens);
    const result = await refresh.refresh(mobileReq(), { refreshToken: 'anything' });
    assert.equal(result.status, 403);
    assert.equal((result.body as { code?: string }).code, 'ATTESTATION_REQUIRED');
  });

  it('refresh still returns MOBILE_ONLY for web when attestation is enforced', async () => {
    process.env.DEVICE_ATTESTATION_MODE = 'mock';
    setDeviceAttestationServiceForTests(new DeviceAttestationService());
    const tokens = new JwtTokenService();
    const refresh = new TokenRefreshService({} as never, {} as never, tokens);
    const result = await refresh.refresh(webReq(), { refreshToken: 'anything' });
    assert.equal(result.status, 403);
    assert.equal((result.body as { code?: string }).code, 'MOBILE_ONLY');
  });
});
