import type { HttpIncomingMessage } from '../../request-context/types';
import { TRUST_DEFAULTS, TRUST_HEADERS } from '../constants';
import { extractHeaderString } from '../../request-context/utils/trace.util';
import type { DeclaredClientIdentity } from '../types';
import type { ClientPlatform, RequestSource } from '../../request-context/types';

const sanitize = (value: string | undefined, max: number): string | undefined => {
  if (!value?.trim()) return undefined;
  return value.trim().slice(0, max);
};

export const parseDeclaredClientIdentity = (
  message: HttpIncomingMessage,
  declaredSource: RequestSource,
  platform: ClientPlatform,
  appVersion?: string,
  buildVersion?: string,
): DeclaredClientIdentity => ({
  clientId: sanitize(extractHeaderString(message.headers, TRUST_HEADERS.CLIENT_ID), TRUST_DEFAULTS.MAX_CLIENT_ID_LENGTH),
  declaredSource,
  platform,
  appVersion,
  buildVersion,
  signature: sanitize(
    extractHeaderString(message.headers, TRUST_HEADERS.CLIENT_SIGNATURE),
    TRUST_DEFAULTS.MAX_SIGNATURE_LENGTH,
  ),
  timestamp: sanitize(extractHeaderString(message.headers, TRUST_HEADERS.CLIENT_TIMESTAMP), 64),
  nonce: sanitize(extractHeaderString(message.headers, TRUST_HEADERS.CLIENT_NONCE), TRUST_DEFAULTS.MAX_NONCE_LENGTH),
});
