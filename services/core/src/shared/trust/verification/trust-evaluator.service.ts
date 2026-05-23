import { RequestSource } from '../../request-context/types';
import { trustConfig } from '../config/trust.config';
import { getAttestationRegistry } from '../attestation/attestation.registry';
import { getDeviceFingerprintService } from '../fingerprints/device-fingerprint.service';
import { getReplayProtectionService } from '../replay/replay-protection.service';
import { getSignatureService } from '../signatures/signature.service';
import { getTrustScorer } from '../scoring/trust-scorer.service';
import {
  VerificationMethod,
  VerificationStatus,
  type ClientTrustContext,
  type TrustEvaluationInput,
} from '../types';
import { parseDeclaredClientIdentity } from '../utils';
import { getClientRegistry } from './env-client.registry';

export class TrustEvaluatorService {
  async evaluate(input: TrustEvaluationInput): Promise<ClientTrustContext> {
    const declared = parseDeclaredClientIdentity(
      input.message,
      input.declaredSource,
      input.platform,
      input.appVersion,
      input.buildVersion,
    );

    const registry = getClientRegistry();
    const registered = declared.clientId ? registry.resolve(declared.clientId) : null;

    let verifiedSource: RequestSource | null = null;
    let registryMatch = false;
    const verificationMethods: VerificationMethod[] = [];

    if (registered) {
      registryMatch = true;
      verificationMethods.push(VerificationMethod.ClientRegistry);
      const allowed = registered.allowedSources.includes(declared.declaredSource);
      if (allowed) {
        verifiedSource = declared.declaredSource;
      }
    }

    const signature = getSignatureService().verify(input.message, declared);
    if (signature.status === VerificationStatus.Passed) {
      verificationMethods.push(VerificationMethod.HmacSignature);
      if (!verifiedSource && registered) {
        verifiedSource = declared.declaredSource;
      }
    }

    const replay = await getReplayProtectionService().check(declared);
    const device = getDeviceFingerprintService().evaluate(input.message, input.deviceId);
    const attestation = getAttestationRegistry().collectPlaceholders(
      input.message,
      declared.declaredSource,
    );

    const sourceMismatch = Boolean(
      verifiedSource && verifiedSource !== declared.declaredSource,
    );

    const { trustLevel, verificationStatus } = getTrustScorer().score({
      declared,
      verified: {
        clientId: declared.clientId,
        verifiedSource,
        platform: verifiedSource ? input.platform : null,
        registryMatch,
      },
      signature,
      replay,
      device,
      sourceMismatch,
    });

    return {
      trustLevel,
      verificationStatus,
      declaredSource: declared.declaredSource,
      verifiedSource,
      declared,
      verified: {
        clientId: declared.clientId,
        verifiedSource,
        platform: verifiedSource ? input.platform : null,
        registryMatch,
      },
      signature,
      replay,
      device,
      attestation,
      verificationMethods,
      policyFlags: {
        sourceMismatch,
        missingClientId: !declared.clientId,
        expiredTimestamp: replay.reason?.includes('timestamp') ?? false,
        invalidSignature: signature.status === VerificationStatus.Failed,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
}

let evaluatorInstance: TrustEvaluatorService | null = null;
export const getTrustEvaluator = (): TrustEvaluatorService => {
  if (!evaluatorInstance) evaluatorInstance = new TrustEvaluatorService();
  return evaluatorInstance;
};
