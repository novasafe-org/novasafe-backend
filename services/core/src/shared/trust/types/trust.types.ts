import type { ClientPlatform, RequestSource } from '../../request-context/types';

/** Zero-trust classification for the current request. */
export enum TrustLevel {
  Trusted = 'TRUSTED',
  Verified = 'VERIFIED',
  Limited = 'LIMITED',
  Unverified = 'UNVERIFIED',
  Suspicious = 'SUSPICIOUS',
  Blocked = 'BLOCKED',
}

export enum VerificationStatus {
  Skipped = 'SKIPPED',
  Pending = 'PENDING',
  Passed = 'PASSED',
  Failed = 'FAILED',
  Partial = 'PARTIAL',
}

export enum VerificationMethod {
  None = 'NONE',
  ClientRegistry = 'CLIENT_REGISTRY',
  HmacSignature = 'HMAC_SIGNATURE',
  JwtBinding = 'JWT_BINDING',
  PlayIntegrity = 'PLAY_INTEGRITY',
  AppleAppAttest = 'APPLE_APP_ATTEST',
  ExtensionManifest = 'EXTENSION_MANIFEST',
  DesktopCodeSign = 'DESKTOP_CODE_SIGN',
}

/** Declared client identity from headers (untrusted until verified). */
export interface DeclaredClientIdentity {
  clientId?: string;
  declaredSource: RequestSource;
  platform: ClientPlatform;
  appVersion?: string;
  buildVersion?: string;
  signature?: string;
  timestamp?: string;
  nonce?: string;
}

/** Verified client identity after trust layer evaluation. */
export interface VerifiedClientIdentity {
  clientId?: string;
  verifiedSource: RequestSource | null;
  platform: ClientPlatform | null;
  registryMatch: boolean;
}

export interface SignatureVerificationResult {
  status: VerificationStatus;
  method: VerificationMethod;
  valid: boolean;
  reason?: string;
}

export interface ReplayProtectionResult {
  status: VerificationStatus;
  valid: boolean;
  replayDetected: boolean;
  reason?: string;
  expiresAt?: string;
}

export interface DeviceTrustSignals {
  fingerprint?: string;
  trustedDevice: boolean;
  riskScore: number;
  suspicious: boolean;
}

export interface AttestationPlaceholder {
  provider: 'play_integrity' | 'apple_app_attest' | 'extension' | 'desktop';
  status: VerificationStatus;
  tokenPresent: boolean;
}

/** Full trust evaluation attached to request context. */
export interface ClientTrustContext {
  trustLevel: TrustLevel;
  verificationStatus: VerificationStatus;
  declaredSource: RequestSource;
  verifiedSource: RequestSource | null;
  declared: DeclaredClientIdentity;
  verified: VerifiedClientIdentity;
  signature: SignatureVerificationResult;
  replay: ReplayProtectionResult;
  device: DeviceTrustSignals;
  attestation: AttestationPlaceholder[];
  verificationMethods: VerificationMethod[];
  policyFlags: {
    sourceMismatch: boolean;
    missingClientId: boolean;
    expiredTimestamp: boolean;
    invalidSignature: boolean;
  };
  evaluatedAt: string;
}

export interface TrustEvaluationInput {
  message: import('../../request-context/types').HttpIncomingMessage;
  declaredSource: RequestSource;
  platform: ClientPlatform;
  appVersion?: string;
  buildVersion?: string;
  deviceId?: string;
  requestId: string;
  path: string;
  method: string;
}
