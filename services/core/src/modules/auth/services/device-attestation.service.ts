import type { Request } from 'express';
import { GoogleAuth } from 'google-auth-library';
import { SignJWT, importPKCS8 } from 'jose';
import { createPublicKey, createHash, verify as cryptoVerify } from 'node:crypto';
import { authConfig } from '../../../config/auth.config';
import { logger } from '../../../shared/logger';
import { isMobileAppClient } from '../helpers/mobile-client.helper';

export const DEVICE_ATTESTATION_HEADER = 'x-device-attestation';

export type AttestationProvider = 'play_integrity' | 'app_attest' | 'device_check' | 'mock';

export type AttestationEnvelope = {
  v: number;
  platform: 'android' | 'ios';
  provider: AttestationProvider;
  token: string;
  keyId?: string;
  challenge?: string;
  /** App Attest public key (SPKI base64) after key attestation — used to verify assertions. */
  publicKeySpki?: string;
};

export type AttestationResult =
  | { ok: true; provider: AttestationProvider; platform: 'android' | 'ios' }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export type PlayIntegrityDecoder = (args: {
  packageName: string;
  integrityToken: string;
}) => Promise<{
  packageName?: string;
  certificateSha256Digest?: string[];
  appRecognitionVerdict?: string;
  deviceIntegrityVerdicts?: string[];
  requestHash?: string;
}>;

export type DeviceCheckValidator = (token: string) => Promise<boolean>;

export type AppAttestAssertionVerifier = (args: {
  assertionObjectB64: string;
  keyId: string;
  challenge: string;
  bundleId: string;
  publicKeySpki?: string;
}) => Promise<boolean>;

const MOCK_VALID_PREFIX = 'novasafe-mock-attest:valid';

const fail = (status: number, code: string, message: string): AttestationResult => ({
  ok: false,
  status,
  code,
  message,
});

/**
 * Verifies X-Device-Attestation for native mobile refresh / step-up.
 * Web / extension clients are never required to attest (they don't use these flows).
 */
export class DeviceAttestationService {
  constructor(
    private readonly playIntegrityDecode: PlayIntegrityDecoder = defaultPlayIntegrityDecode,
    private readonly deviceCheckValidate: DeviceCheckValidator = defaultDeviceCheckValidate,
    private readonly appAttestVerify: AppAttestAssertionVerifier = defaultAppAttestVerify,
  ) {}

  /**
   * Gate for refresh + step-up. No-op when mode=off or client is not mobile.
   */
  async assertForMobileSession(req: Request): Promise<AttestationResult | null> {
    if (!isMobileAppClient(req)) return null;

    // Read env each call so CI/tests can toggle without reloading the module.
    const mode = (process.env.DEVICE_ATTESTATION_MODE || authConfig.attestation.mode || 'off')
      .toLowerCase() as 'off' | 'mock' | 'enforce';
    if (mode === 'off') return { ok: true, provider: 'mock', platform: resolvePlatform(req) };

    const raw = extractAttestationHeader(req);
    if (!raw) {
      return fail(
        403,
        'ATTESTATION_REQUIRED',
        'Device attestation is required. Update NovaSafe or try again on a supported device.',
      );
    }

    const envelope = parseEnvelope(raw);
    if (!envelope) {
      return fail(403, 'ATTESTATION_INVALID', 'Device attestation token is malformed.');
    }

    if (mode === 'mock') {
      return this.verifyMock(envelope);
    }

    return this.verifyEnforce(envelope, req);
  }

  private verifyMock(envelope: AttestationEnvelope): AttestationResult {
    // Accept tokens prefixed with novasafe-mock-attest:valid (CI / local Flutter debug).
    if (!envelope.token.startsWith(MOCK_VALID_PREFIX)) {
      return fail(403, 'ATTESTATION_INVALID', 'Device attestation mock token was rejected.');
    }
    return { ok: true, provider: 'mock', platform: envelope.platform };
  }

  private async verifyEnforce(
    envelope: AttestationEnvelope,
    req: Request,
  ): Promise<AttestationResult> {
    const platform = envelope.platform || resolvePlatform(req);
    try {
      if (platform === 'android' || envelope.provider === 'play_integrity') {
        return await this.verifyPlayIntegrity(envelope);
      }
      if (envelope.provider === 'device_check') {
        return await this.verifyDeviceCheck(envelope);
      }
      if (envelope.provider === 'app_attest') {
        return await this.verifyAppAttest(envelope);
      }
      return fail(
        403,
        'ATTESTATION_INVALID',
        'Unsupported device attestation provider for this platform.',
      );
    } catch (err) {
      logger.warn('Device attestation verification failed', {
        platform,
        provider: envelope.provider,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail(
        403,
        'ATTESTATION_INVALID',
        'Device attestation could not be verified. Sign in again from the official NovaSafe app.',
      );
    }
  }

  private async verifyPlayIntegrity(envelope: AttestationEnvelope): Promise<AttestationResult> {
    const packageName = authConfig.attestation.androidPackageName;
    const decoded = await this.playIntegrityDecode({
      packageName,
      integrityToken: envelope.token,
    });

    if (decoded.packageName && decoded.packageName !== packageName) {
      return fail(403, 'ATTESTATION_INVALID', 'Attestation package name mismatch.');
    }

    const verdict = String(decoded.appRecognitionVerdict || '').toUpperCase();
    if (verdict === 'UNEVALUATED') {
      return fail(403, 'ATTESTATION_INVALID', 'Play Integrity could not evaluate this app build.');
    }
    // Prefer PLAY_RECOGNIZED; allow UNRECOGNIZED_VERSION only when cert digest is allowlisted.
    const digests = decoded.certificateSha256Digest || [];
    const allowed = authConfig.attestation.androidAllowedCertDigests;
    if (allowed.length > 0) {
      const okCert = digests.some((d) => allowed.includes(d));
      if (!okCert) {
        return fail(403, 'ATTESTATION_INVALID', 'App signing certificate is not trusted.');
      }
    } else if (verdict && verdict !== 'PLAY_RECOGNIZED') {
      return fail(403, 'ATTESTATION_INVALID', 'App is not recognized by Google Play Integrity.');
    }

    if (authConfig.attestation.androidRequireDeviceIntegrity) {
      const device = decoded.deviceIntegrityVerdicts || [];
      const meets =
        device.includes('MEETS_DEVICE_INTEGRITY') ||
        device.includes('MEETS_STRONG_INTEGRITY') ||
        device.includes('MEETS_VIRTUAL_INTEGRITY');
      if (!meets) {
        return fail(
          403,
          'ATTESTATION_INVALID',
          'This device does not meet Play Integrity device requirements.',
        );
      }
    }

    if (envelope.challenge && decoded.requestHash) {
      const expected = createHash('sha256').update(envelope.challenge).digest('base64url');
      // Play may return requestHash as base64 of the hash we sent; compare loosely.
      if (
        decoded.requestHash !== envelope.challenge &&
        decoded.requestHash !== expected &&
        !decoded.requestHash.includes(envelope.challenge.slice(0, 16))
      ) {
        logger.warn('Play Integrity challenge mismatch', {
          expectedPrefix: envelope.challenge.slice(0, 12),
        });
      }
    }

    return { ok: true, provider: 'play_integrity', platform: 'android' };
  }

  private async verifyDeviceCheck(envelope: AttestationEnvelope): Promise<AttestationResult> {
    const ok = await this.deviceCheckValidate(envelope.token);
    if (!ok) {
      return fail(403, 'ATTESTATION_INVALID', 'Apple DeviceCheck token was rejected.');
    }
    return { ok: true, provider: 'device_check', platform: 'ios' };
  }

  private async verifyAppAttest(envelope: AttestationEnvelope): Promise<AttestationResult> {
    if (!envelope.keyId || !envelope.challenge) {
      return fail(
        403,
        'ATTESTATION_INVALID',
        'App Attest assertion requires keyId and challenge.',
      );
    }
    const ok = await this.appAttestVerify({
      assertionObjectB64: envelope.token,
      keyId: envelope.keyId,
      challenge: envelope.challenge,
      bundleId: authConfig.attestation.iosBundleId,
      publicKeySpki: envelope.publicKeySpki,
    });
    if (!ok) {
      return fail(403, 'ATTESTATION_INVALID', 'Apple App Attest assertion was rejected.');
    }
    return { ok: true, provider: 'app_attest', platform: 'ios' };
  }
}

export const extractAttestationHeader = (req: Request): string => {
  const h = req.headers[DEVICE_ATTESTATION_HEADER] ?? req.headers['x-client-attestation'];
  if (Array.isArray(h)) return String(h[0] || '').trim();
  return String(h || '').trim();
};

export const parseEnvelope = (raw: string): AttestationEnvelope | null => {
  try {
    // Accept raw JSON or base64url/base64 JSON.
    let text = raw;
    if (!raw.trim().startsWith('{')) {
      const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
      const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      text = Buffer.from(normalized + pad, 'base64').toString('utf8');
    }
    const parsed = JSON.parse(text) as Partial<AttestationEnvelope>;
    if (!parsed.token || !parsed.platform || !parsed.provider) return null;
    if (parsed.platform !== 'android' && parsed.platform !== 'ios') return null;
    return {
      v: Number(parsed.v || 1),
      platform: parsed.platform,
      provider: parsed.provider,
      token: String(parsed.token),
      keyId: parsed.keyId ? String(parsed.keyId) : undefined,
      challenge: parsed.challenge ? String(parsed.challenge) : undefined,
      publicKeySpki: parsed.publicKeySpki ? String(parsed.publicKeySpki) : undefined,
    };
  } catch {
    return null;
  }
};

export const resolvePlatform = (req: Request): 'android' | 'ios' => {
  const header = String(req.headers['x-client-source'] || '').toUpperCase();
  if (header === 'MOBILE_IOS') return 'ios';
  if (header === 'MOBILE_ANDROID') return 'android';
  const platform = String(req.body?.devicePlatform || '').toLowerCase();
  if (platform === 'ios') return 'ios';
  return 'android';
};

export const toAttestationHttpResult = (
  result: AttestationResult,
): { status: number; body: Record<string, unknown> } | null => {
  if (result.ok) return null;
  const failed = result as Extract<AttestationResult, { ok: false }>;
  return {
    status: failed.status,
    body: {
      success: false,
      code: failed.code,
      message: failed.message,
    },
  };
};

async function defaultPlayIntegrityDecode(args: {
  packageName: string;
  integrityToken: string;
}): Promise<{
  packageName?: string;
  certificateSha256Digest?: string[];
  appRecognitionVerdict?: string;
  deviceIntegrityVerdicts?: string[];
  requestHash?: string;
}> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });
  const client = await auth.getClient();
  const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(args.packageName)}:decodeIntegrityToken`;
  const res = await client.request<{
    tokenPayloadExternal?: {
      appIntegrity?: {
        packageName?: string;
        certificateSha256Digest?: string[];
        appRecognitionVerdict?: string;
      };
      deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
      requestDetails?: { requestHash?: string; nonce?: string };
    };
  }>({
    url,
    method: 'POST',
    data: { integrityToken: args.integrityToken },
  });
  const payload = res.data?.tokenPayloadExternal;
  return {
    packageName: payload?.appIntegrity?.packageName,
    certificateSha256Digest: payload?.appIntegrity?.certificateSha256Digest,
    appRecognitionVerdict: payload?.appIntegrity?.appRecognitionVerdict || undefined,
    deviceIntegrityVerdicts: payload?.deviceIntegrity?.deviceRecognitionVerdict,
    requestHash: payload?.requestDetails?.requestHash || payload?.requestDetails?.nonce,
  };
}

async function defaultDeviceCheckValidate(token: string): Promise<boolean> {
  const { appleTeamId, appleDeviceCheckKeyId, appleDeviceCheckPrivateKey, appleDeviceCheckProduction } =
    authConfig.attestation;
  if (!appleTeamId || !appleDeviceCheckKeyId || !appleDeviceCheckPrivateKey) {
    throw new Error('Apple DeviceCheck credentials are not configured');
  }
  const keyPem = appleDeviceCheckPrivateKey.includes('BEGIN')
    ? appleDeviceCheckPrivateKey
    : `-----BEGIN PRIVATE KEY-----\n${appleDeviceCheckPrivateKey}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(keyPem.replace(/\\n/g, '\n'), 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: appleDeviceCheckKeyId })
    .setIssuer(appleTeamId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const host = appleDeviceCheckProduction
    ? 'api.devicecheck.apple.com'
    : 'api.development.devicecheck.apple.com';
  const res = await fetch(`https://${host}/v1/validate_device_token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_token: token }),
  });
  return res.status === 200;
}

/**
 * Minimal App Attest assertion check:
 * - Requires previously attested public key (SPKI)
 * - Verifies ECDSA signature over authenticatorData || clientDataHash
 * Full Apple cert-chain attestation of the key itself is expected at key-registration time.
 */
async function defaultAppAttestVerify(args: {
  assertionObjectB64: string;
  keyId: string;
  challenge: string;
  bundleId: string;
  publicKeySpki?: string;
}): Promise<boolean> {
  if (!args.publicKeySpki) {
    // Without a stored public key we cannot cryptographically verify the assertion.
    // Reject in enforce mode rather than soft-accept.
    return false;
  }
  try {
    const assertion = Buffer.from(args.assertionObjectB64, 'base64');
    // App Attest assertion CBOR is typically: { authenticatorData, signature }
    // We accept a simplified JSON wrapper from the Flutter channel for interoperability:
    // { "authenticatorData":"<b64>", "signature":"<b64>", "clientDataHash":"<b64>" }
    const asText = assertion.toString('utf8');
    if (asText.trim().startsWith('{')) {
      const parsed = JSON.parse(asText) as {
        authenticatorData?: string;
        signature?: string;
        clientDataHash?: string;
      };
      if (!parsed.authenticatorData || !parsed.signature) return false;
      const authData = Buffer.from(parsed.authenticatorData, 'base64');
      const signature = Buffer.from(parsed.signature, 'base64');
      const clientDataHash =
        parsed.clientDataHash != null
          ? Buffer.from(parsed.clientDataHash, 'base64')
          : createHash('sha256').update(args.challenge).digest();
      const rpIdHash = createHash('sha256').update(args.bundleId).digest();
      if (authData.length < 37 || !authData.subarray(0, 32).equals(rpIdHash)) {
        return false;
      }
      const signed = Buffer.concat([authData, clientDataHash]);
      const key = createPublicKey({
        key: Buffer.from(args.publicKeySpki, 'base64'),
        format: 'der',
        type: 'spki',
      });
      return cryptoVerify(null, signed, key, signature);
    }
    // Opaque CBOR blob without stored parsing libs — require JSON wrapper from app.
    return false;
  } catch (err) {
    logger.warn('App Attest verify error', {
      keyId: args.keyId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

let deviceAttestationService: DeviceAttestationService | null = null;
export const getDeviceAttestationService = (): DeviceAttestationService => {
  if (!deviceAttestationService) deviceAttestationService = new DeviceAttestationService();
  return deviceAttestationService;
};

/** Test helper — replace singleton. */
export const setDeviceAttestationServiceForTests = (
  service: DeviceAttestationService | null,
): void => {
  deviceAttestationService = service;
};
