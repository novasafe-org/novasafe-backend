import { createHmac, timingSafeEqual } from 'node:crypto';
import { VerificationMethod, VerificationStatus, type SignatureVerificationResult } from '../types';
import { hashRequestBody } from '../utils/request-body-hash.util';
import type { ISignatureVerifier } from '../interfaces';

/**
 * HMAC-SHA256 request signature verifier.
 * Canonical string: METHOD|PATH|BODY_HASH|CLIENT_ID|TIMESTAMP|NONCE
 */
export class HmacSignatureVerifier implements ISignatureVerifier {
  verify(input: {
    method: string;
    path: string;
    body: unknown;
    clientId: string;
    timestamp: string;
    nonce: string;
    signature: string;
    secret: string;
  }): SignatureVerificationResult {
    const bodyHash = hashRequestBody(input.body);
    const canonical = [
      input.method.toUpperCase(),
      input.path,
      bodyHash,
      input.clientId,
      input.timestamp,
      input.nonce,
    ].join('|');

    const expected = createHmac('sha256', input.secret).update(canonical).digest('hex');
    const provided = input.signature.replace(/^sha256=/i, '').trim();

    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return {
          status: VerificationStatus.Failed,
          method: VerificationMethod.HmacSignature,
          valid: false,
          reason: 'Signature mismatch',
        };
      }
      return {
        status: VerificationStatus.Passed,
        method: VerificationMethod.HmacSignature,
        valid: true,
      };
    } catch {
      return {
        status: VerificationStatus.Failed,
        method: VerificationMethod.HmacSignature,
        valid: false,
        reason: 'Invalid signature format',
      };
    }
  }
}
