/**
 * Trust layer configuration (env-driven — no hardcoded trusted clients).
 *
 * TRUST_CLIENT_REGISTRY example (JSON):
 * [{"clientId":"novasafe-mobile-android","allowedSources":["MOBILE_ANDROID"],"secretEnv":"TRUST_SECRET_MOBILE_ANDROID"}]
 */
export interface TrustClientRegistryEntry {
  clientId: string;
  allowedSources: string[];
  platform?: string;
  secretEnv?: string;
  minVersion?: string;
}

const parseRegistry = (): TrustClientRegistryEntry[] => {
  const raw = process.env.TRUST_CLIENT_REGISTRY;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as TrustClientRegistryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const trustConfig = {
  enabled: process.env.TRUST_LAYER_ENABLED !== 'false',
  enforceBlocking: process.env.TRUST_ENFORCE_BLOCKING === 'true',
  signatureVerificationEnabled: process.env.TRUST_SIGNATURE_ENABLED === 'true',
  replayProtectionEnabled: process.env.TRUST_REPLAY_ENABLED !== 'false',
  replayWindowMs: Number(process.env.TRUST_REPLAY_WINDOW_MS || 5 * 60 * 1000),
  nonceTtlMs: Number(process.env.TRUST_NONCE_TTL_MS || 10 * 60 * 1000),
  clientRegistry: parseRegistry(),
  /** Redis URL placeholder — wire when replay cache moves to Redis. */
  redisUrl: process.env.TRUST_REDIS_URL || process.env.REDIS_URL || '',
} as const;
