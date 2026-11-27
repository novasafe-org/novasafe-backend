import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { ObjectId } from '../../../database/object-id';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { DeviceLoginOtpService } from './device-login-otp.service';

const userId = new ObjectId().toString();
const alertId = new ObjectId().toString();
const deviceKey = 'device-b';

function mockReq(): Request {
  return {
    user: { id: userId, email: 'user@example.com' },
    headers: { 'x-device-id': deviceKey, 'user-agent': 'NovaSafeTest/1.0' },
    body: {},
    source: 'mobile',
    socket: { remoteAddress: '203.0.113.10' },
  } as unknown as Request;
}

describe('DeviceLoginOtpService', () => {
  it('exposes DeviceLoginApproval purpose', () => {
    assert.equal(OtpPurpose.DeviceLoginApproval, 'device_login_approval');
  });

  it('rejects verify with non-6-digit otp before DB lookup', async () => {
    const service = new DeviceLoginOtpService();
    const result = await service.verifyOtp(mockReq(), alertId, '12');
    assert.equal(result.status, 400);
    assert.match(String(result.body.message), /6-digit/i);
  });

  it('rejects request without auth', async () => {
    const service = new DeviceLoginOtpService();
    const req = { headers: {}, body: {} } as unknown as Request;
    const result = await service.requestOtp(req, alertId);
    assert.equal(result.status, 401);
  });

  it('rejects invalid alert id on request', async () => {
    const service = new DeviceLoginOtpService();
    const result = await service.requestOtp(mockReq(), 'not-an-id');
    assert.equal(result.status, 400);
  });
});
