import { createHash } from 'node:crypto';

import {
  buildDefaultFeatureFlagSnapshot,
  FEATURE_FLAG_CATALOG_VERSION,
  initializeFeatureFlagCatalog,
  isKnownFeatureFlagKey,
  resolveFeatureFlagEnvironment,
  type FeatureFlagEnvironment,
  type FeatureFlagKey,
} from '@novasafe/feature-flags';

import { getNativeMongo } from '../../database/adapters/native-mongo.adapter';
import { COLLECTIONS } from '../../database/collections';

export const FEATURE_FLAGS_COLLECTION = COLLECTIONS.featureFlags;
const CACHE_TTL_MS = 60_000;

export interface ResolvedClientFeatureFlags {
  catalogVersion: string;
  storeVersion: number;
  environment: FeatureFlagEnvironment;
  flags: Record<FeatureFlagKey, boolean>;
}

interface CacheEntry {
  expiresAt: number;
  snapshot: ResolvedClientFeatureFlags;
}

const cache = new Map<string, CacheEntry>();

type FeatureFlagDbRecord = {
  key: string;
  environment: FeatureFlagEnvironment;
  enabled: boolean;
  version?: number;
};

export const clearFeatureFlagCache = (): void => {
  cache.clear();
};

export const buildFeatureFlagEtag = (snapshot: ResolvedClientFeatureFlags): string => {
  const payload = `${snapshot.catalogVersion}:${snapshot.storeVersion}:${snapshot.environment}`;
  return `"${createHash('sha256').update(payload).digest('hex').slice(0, 16)}"`;
};

export const resolveClientFeatureFlags = async (
  environmentInput?: string,
): Promise<ResolvedClientFeatureFlags> => {
  initializeFeatureFlagCatalog();
  const environment = environmentInput
    ? resolveFeatureFlagEnvironment(environmentInput as FeatureFlagEnvironment)
    : resolveFeatureFlagEnvironment();

  const cached = cache.get(environment);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const defaults = buildDefaultFeatureFlagSnapshot(environment);
  const flags: Record<FeatureFlagKey, boolean> = { ...defaults.flags };
  let storeVersion = 1;

  try {
    const records = (await getNativeMongo().findMany(FEATURE_FLAGS_COLLECTION, {
      environment,
    })) as unknown as FeatureFlagDbRecord[];

    for (const record of records) {
      if (!isKnownFeatureFlagKey(record.key)) {
        continue;
      }
      flags[record.key] = Boolean(record.enabled);
      storeVersion = Math.max(storeVersion, Number(record.version) || 1);
    }
  } catch {
    // Mongo unavailable — safe catalog defaults already applied.
  }

  const snapshot: ResolvedClientFeatureFlags = {
    catalogVersion: FEATURE_FLAG_CATALOG_VERSION,
    storeVersion,
    environment,
    flags,
  };

  cache.set(environment, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    snapshot,
  });

  return snapshot;
};
