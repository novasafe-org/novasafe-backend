export interface FeatureFlagMetricsSnapshot {
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  avgResolutionMs: number;
  lastResolutionMs: number | null;
}

let cacheHits = 0;
let cacheMisses = 0;
let totalResolutionMs = 0;
let resolutionCount = 0;
let lastResolutionMs: number | null = null;

export const recordFeatureFlagCacheHit = (): void => {
  cacheHits += 1;
};

export const recordFeatureFlagCacheMiss = (durationMs: number): void => {
  cacheMisses += 1;
  totalResolutionMs += durationMs;
  resolutionCount += 1;
  lastResolutionMs = durationMs;
};

export const getFeatureFlagMetrics = (): FeatureFlagMetricsSnapshot => {
  const total = cacheHits + cacheMisses;
  return {
    cacheHits,
    cacheMisses,
    cacheHitRate: total > 0 ? cacheHits / total : 0,
    avgResolutionMs: resolutionCount > 0 ? totalResolutionMs / resolutionCount : 0,
    lastResolutionMs,
  };
};

export const resetFeatureFlagMetrics = (): void => {
  cacheHits = 0;
  cacheMisses = 0;
  totalResolutionMs = 0;
  resolutionCount = 0;
  lastResolutionMs = null;
};
