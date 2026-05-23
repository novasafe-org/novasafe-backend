import { VerificationStatus, type AttestationPlaceholder } from '../types';
import { extractHeaderString } from '../../request-context/utils/trace.util';
import { TRUST_HEADERS } from '../constants';
import type { HttpIncomingMessage } from '../../request-context/types';
import { RequestSource } from '../../request-context/types';

/**
 * Future: Play Integrity, Apple App Attest, extension manifest, desktop code signing.
 */
export class AttestationRegistry {
  collectPlaceholders(
    message: HttpIncomingMessage,
    declaredSource: RequestSource,
  ): AttestationPlaceholder[] {
    const token = extractHeaderString(message.headers, TRUST_HEADERS.ATTESTATION_TOKEN);
    const providers: AttestationPlaceholder['provider'][] = [];

    if (declaredSource === RequestSource.MobileAndroid) providers.push('play_integrity');
    if (declaredSource === RequestSource.MobileIos) providers.push('apple_app_attest');
    if (declaredSource === RequestSource.BrowserExtension) providers.push('extension');
    if (declaredSource === RequestSource.DesktopApp) providers.push('desktop');

    return providers.map((provider) => ({
      provider,
      status: VerificationStatus.Skipped,
      tokenPresent: Boolean(token),
    }));
  }
}

let attestationRegistry: AttestationRegistry | null = null;
export const getAttestationRegistry = (): AttestationRegistry => {
  if (!attestationRegistry) attestationRegistry = new AttestationRegistry();
  return attestationRegistry;
};
