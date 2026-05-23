import { trustConfig } from '../config/trust.config';
import {
  VerificationMethod,
  VerificationStatus,
  type DeclaredClientIdentity,
  type SignatureVerificationResult,
} from '../types';
import type { HttpIncomingMessage } from '../../request-context/types';
import { getClientRegistry } from '../verification/env-client.registry';
import { HmacSignatureVerifier } from './hmac.signature.verifier';

export class SignatureService {
  constructor(
    private readonly verifier = new HmacSignatureVerifier(),
    private readonly registry = getClientRegistry(),
  ) {}

  verify(
    message: HttpIncomingMessage,
    declared: DeclaredClientIdentity,
  ): SignatureVerificationResult {
    if (!trustConfig.signatureVerificationEnabled) {
      return {
        status: VerificationStatus.Skipped,
        method: VerificationMethod.None,
        valid: false,
        reason: 'Signature verification disabled',
      };
    }

    const { clientId, signature, timestamp, nonce } = declared;
    if (!clientId || !signature || !timestamp || !nonce) {
      return {
        status: VerificationStatus.Skipped,
        method: VerificationMethod.HmacSignature,
        valid: false,
        reason: 'Missing signing headers',
      };
    }

    const client = this.registry.resolve(clientId);
    if (!client?.secret) {
      return {
        status: VerificationStatus.Failed,
        method: VerificationMethod.HmacSignature,
        valid: false,
        reason: 'Unknown client or missing secret',
      };
    }

    return this.verifier.verify({
      method: message.method,
      path: message.originalUrl || message.path,
      body: message.body,
      clientId,
      timestamp,
      nonce,
      signature,
      secret: client.secret,
    });
  }
}

let signatureService: SignatureService | null = null;
export const getSignatureService = (): SignatureService => {
  if (!signatureService) signatureService = new SignatureService();
  return signatureService;
};
