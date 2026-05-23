import type { ReplayProtectionResult, SignatureVerificationResult, TrustEvaluationInput } from '../types';
import type { ClientTrustContext } from '../types';

export interface IReplayCache {
  /** Returns true if nonce was already used (replay). */
  hasNonce(clientId: string, nonce: string): Promise<boolean>;
  storeNonce(clientId: string, nonce: string, ttlMs: number): Promise<void>;
}

export interface ISignatureVerifier {
  verify(input: {
    method: string;
    path: string;
    body: unknown;
    clientId: string;
    timestamp: string;
    nonce: string;
    signature: string;
    secret: string;
  }): SignatureVerificationResult;
}

export interface IRegisteredClient {
  clientId: string;
  secret?: string;
  allowedSources: string[];
  platform?: string;
  minVersion?: string;
  capabilities?: string[];
}

export interface IClientRegistry {
  resolve(clientId: string): IRegisteredClient | null;
  list(): IRegisteredClient[];
}

export interface IAttestationVerifier {
  readonly provider: string;
  verify(_token: string): Promise<{ status: 'SKIPPED' | 'PASSED' | 'FAILED'; reason?: string }>;
}

export interface ITrustEvaluator {
  evaluate(input: TrustEvaluationInput): Promise<ClientTrustContext>;
}
