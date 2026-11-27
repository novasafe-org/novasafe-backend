import { createHash } from 'node:crypto';
import type { DeviceTrustSignals } from '../types';
import type { HttpIncomingMessage } from '../../request-context/types';

/**
 * Device fingerprint helper.
 * Auth/session binding prefers the client `X-Device-Fingerprint` (hardware-adjacent).
 * This service still produces a request-level signal hash for trust scoring / audit.
 */
export class DeviceFingerprintService {
  /** Prefer explicit client hardware fingerprint header when present. */
  resolveClientHardwareFingerprint(message: HttpIncomingMessage): string | null {
    const header = message.headers['x-device-fingerprint'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const cleaned = raw.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    return cleaned.length >= 16 ? cleaned.slice(0, 128) : null;
  }

  compute(message: HttpIncomingMessage, deviceId?: string): string {
    const hardware = this.resolveClientHardwareFingerprint(message);
    if (hardware) return hardware;

    const parts = [
      deviceId || '',
      message.headers['user-agent'] || '',
      message.remoteAddress || '',
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  }

  evaluate(message: HttpIncomingMessage, deviceId?: string): DeviceTrustSignals {
    const fingerprint = this.compute(message, deviceId);
    const hasHardware = Boolean(this.resolveClientHardwareFingerprint(message));
    return {
      fingerprint,
      trustedDevice: false,
      riskScore: hasHardware ? 0 : 5,
      suspicious: false,
    };
  }
}

let fingerprintService: DeviceFingerprintService | null = null;
export const getDeviceFingerprintService = (): DeviceFingerprintService => {
  if (!fingerprintService) fingerprintService = new DeviceFingerprintService();
  return fingerprintService;
};
