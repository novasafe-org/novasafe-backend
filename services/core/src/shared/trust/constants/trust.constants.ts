/** HTTP headers for client identity and request signing (declared only — not trusted). */
export const TRUST_HEADERS = {
  CLIENT_ID: 'x-client-id',
  CLIENT_SIGNATURE: 'x-client-signature',
  CLIENT_TIMESTAMP: 'x-client-timestamp',
  CLIENT_NONCE: 'x-client-nonce',
  ATTESTATION_TOKEN: 'x-client-attestation',
} as const;

export const TRUST_DEFAULTS = {
  /** Max clock skew / request age for signed requests (5 minutes). */
  REPLAY_WINDOW_MS: 5 * 60 * 1000,
  /** Nonce TTL in replay cache (10 minutes). */
  NONCE_TTL_MS: 10 * 60 * 1000,
  MAX_SIGNATURE_LENGTH: 512,
  MAX_NONCE_LENGTH: 128,
  MAX_CLIENT_ID_LENGTH: 64,
} as const;
