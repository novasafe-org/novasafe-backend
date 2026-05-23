import { createHash } from 'node:crypto';
import type { DeviceTrustSignals } from '../types';
import type { HttpIncomingMessage } from '../../request-context/types';

/**
 * Device fingerprint placeholder — not used for blocking yet.
 */
export class DeviceFingerprintService {
  compute(message: HttpIncomingMessage, deviceId?: string): string {
    const parts = [
      deviceId || '',
      message.headers['user-agent'] || '',
      message.remoteAddress || '',
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  }

  evaluate(message: HttpIncomingMessage, deviceId?: string): DeviceTrustSignals {
    const fingerprint = this.compute(message, deviceId);
    return {
      fingerprint,
      trustedDevice: false,
      riskScore: 0,
      suspicious: false,
    };
  }
}

let fingerprintService: DeviceFingerprintService | null = null;
export const getDeviceFingerprintService = (): DeviceFingerprintService => {
  if (!fingerprintService) fingerprintService = new DeviceFingerprintService();
  return fingerprintService;
};
