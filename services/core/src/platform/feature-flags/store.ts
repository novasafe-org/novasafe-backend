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

import { COLLECTIONS } from '../../database/collections';
import { getFeatureFlagsCollection } from './db';
import { recordFeatureFlagCacheHit, recordFeatureFlagCacheMiss } from './metrics';

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

export const clearFeatureFlagCache = (): void => {
  cache.clear();
};

export const buildFeatureFlagEtag = (snapshot: ResolvedClientFeatureFlags): string => {
  const payload = `${snapshot.catalogVersion}:${snapshot.storeVersion}:${snapshot.environment}`;
  return `"${createHash('sha256').update(payload).digest('hex').slice(0, 16)}"`;
};

async function loadFeatureFlagRecords(
  environment: FeatureFlagEnvironment,
) {
  return getFeatureFlagsCollection(FEATURE_FLAGS_COLLECTION)
    .find({ environment })
    .toArray();
}

export const resolveClientFeatureFlags = async (
  environmentInput?: string,
): Promise<{ snapshot: ResolvedClientFeatureFlags; cacheHit: boolean }> => {
  initializeFeatureFlagCatalog();
  const environment = environmentInput
    ? resolveFeatureFlagEnvironment(environmentInput as FeatureFlagEnvironment)
    : resolveFeatureFlagEnvironment();

  const cached = cache.get(environment);
  if (cached && cached.expiresAt > Date.now()) {
    recordFeatureFlagCacheHit();
    return { snapshot: cached.snapshot, cacheHit: true };
  }

  const startedAt = Date.now();
  const defaults = buildDefaultFeatureFlagSnapshot(environment);
  const flags: Record<FeatureFlagKey, boolean> = { ...defaults.flags };
  let storeVersion = 1;

  try {
    const records = await loadFeatureFlagRecords(environment);

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

  recordFeatureFlagCacheMiss(Date.now() - startedAt);
  return { snapshot, cacheHit: false };
};
