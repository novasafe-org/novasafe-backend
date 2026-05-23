import {
  TrustLevel,
  VerificationStatus,
  type ClientTrustContext,
  type DeclaredClientIdentity,
  type ReplayProtectionResult,
  type SignatureVerificationResult,
  type VerifiedClientIdentity,
} from '../types';
import type { DeviceTrustSignals } from '../types';

export interface TrustScoreInput {
  declared: DeclaredClientIdentity;
  verified: VerifiedClientIdentity;
  signature: SignatureVerificationResult;
  replay: ReplayProtectionResult;
  device: DeviceTrustSignals;
  sourceMismatch: boolean;
}

/**
 * Aggregates verification signals into a single trust level.
 * Does not block — classification only until TRUST_ENFORCE_BLOCKING is enabled.
 */
export class TrustScorerService {
  score(input: TrustScoreInput): Pick<ClientTrustContext, 'trustLevel' | 'verificationStatus'> {
    const { declared, verified, signature, replay, device, sourceMismatch } = input;

    if (replay.replayDetected) {
      return { trustLevel: TrustLevel.Blocked, verificationStatus: VerificationStatus.Failed };
    }

    if (replay.status === VerificationStatus.Failed || signature.status === VerificationStatus.Failed) {
      return { trustLevel: TrustLevel.Suspicious, verificationStatus: VerificationStatus.Failed };
    }

    if (sourceMismatch) {
      return { trustLevel: TrustLevel.Suspicious, verificationStatus: VerificationStatus.Partial };
    }

    const signaturePassed = signature.status === VerificationStatus.Passed;
    const registryVerified = verified.registryMatch && verified.verifiedSource !== null;

    if (signaturePassed && registryVerified) {
      return { trustLevel: TrustLevel.Trusted, verificationStatus: VerificationStatus.Passed };
    }

    if (registryVerified) {
      return { trustLevel: TrustLevel.Verified, verificationStatus: VerificationStatus.Passed };
    }

    if (signaturePassed) {
      return { trustLevel: TrustLevel.Limited, verificationStatus: VerificationStatus.Partial };
    }

    if (!declared.clientId) {
      return { trustLevel: TrustLevel.Unverified, verificationStatus: VerificationStatus.Skipped };
    }

    if (device.suspicious || device.riskScore > 70) {
      return { trustLevel: TrustLevel.Suspicious, verificationStatus: VerificationStatus.Partial };
    }

    return { trustLevel: TrustLevel.Unverified, verificationStatus: VerificationStatus.Pending };
  }
}

let trustScorer: TrustScorerService | null = null;
export const getTrustScorer = (): TrustScorerService => {
  if (!trustScorer) trustScorer = new TrustScorerService();
  return trustScorer;
};
