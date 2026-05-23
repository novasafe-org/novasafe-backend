import { trustConfig } from '../config/trust.config';
import {
  VerificationStatus,
  type DeclaredClientIdentity,
  type ReplayProtectionResult,
} from '../types';
import { isTimestampWithinWindow, parseClientTimestamp } from '../utils';
import { getReplayCache } from './in-memory-replay.cache';

export class ReplayProtectionService {
  constructor(private readonly cache = getReplayCache()) {}

  async check(declared: DeclaredClientIdentity): Promise<ReplayProtectionResult> {
    if (!trustConfig.replayProtectionEnabled) {
      return {
        status: VerificationStatus.Skipped,
        valid: true,
        replayDetected: false,
        reason: 'Replay protection disabled',
      };
    }

    const { clientId, timestamp, nonce } = declared;
    if (!timestamp || !nonce) {
      return {
        status: VerificationStatus.Skipped,
        valid: true,
        replayDetected: false,
        reason: 'No timestamp/nonce provided',
      };
    }

    const ts = parseClientTimestamp(timestamp);
    if (ts === null) {
      return {
        status: VerificationStatus.Failed,
        valid: false,
        replayDetected: false,
        reason: 'Invalid timestamp',
      };
    }

    if (!isTimestampWithinWindow(ts, Date.now(), trustConfig.replayWindowMs)) {
      return {
        status: VerificationStatus.Failed,
        valid: false,
        replayDetected: false,
        reason: 'Request timestamp outside allowed window',
        expiresAt: new Date(ts + trustConfig.replayWindowMs).toISOString(),
      };
    }

    const id = clientId || 'anonymous';
    if (await this.cache.hasNonce(id, nonce)) {
      return {
        status: VerificationStatus.Failed,
        valid: false,
        replayDetected: true,
        reason: 'Nonce replay detected',
      };
    }

    await this.cache.storeNonce(id, nonce, trustConfig.nonceTtlMs);

    return {
      status: VerificationStatus.Passed,
      valid: true,
      replayDetected: false,
    };
  }
}

let replayService: ReplayProtectionService | null = null;
export const getReplayProtectionService = (): ReplayProtectionService => {
  if (!replayService) replayService = new ReplayProtectionService();
  return replayService;
};
