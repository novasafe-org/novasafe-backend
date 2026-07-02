import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDefaultFeatureFlagSnapshot,
  initializeFeatureFlagCatalog,
} from '@novasafe/feature-flags';

import { resetFeatureFlagMetrics } from './metrics';
import {
  buildFeatureFlagEtag,
  clearFeatureFlagCache,
  resolveClientFeatureFlags,
} from './store';

describe('resolveClientFeatureFlags', () => {
  it('returns catalog defaults when Mongo is unavailable', async () => {
    clearFeatureFlagCache();
    resetFeatureFlagMetrics();
    initializeFeatureFlagCatalog();
    const expected = buildDefaultFeatureFlagSnapshot('production');

    const { snapshot, cacheHit } = await resolveClientFeatureFlags('production');

    assert.equal(snapshot.environment, 'production');
    assert.deepEqual(snapshot.flags, expected.flags);
    assert.equal(snapshot.catalogVersion, expected.version);
    assert.equal(cacheHit, false);
  });

  it('serves subsequent requests from in-memory cache', async () => {
    clearFeatureFlagCache();
    resetFeatureFlagMetrics();
    initializeFeatureFlagCatalog();

    const first = await resolveClientFeatureFlags('production');
    const second = await resolveClientFeatureFlags('production');

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(second.snapshot, first.snapshot);
  });

  it('builds stable ETag from snapshot version metadata', () => {
    const etag = buildFeatureFlagEtag({
      catalogVersion: '2',
      storeVersion: 5,
      environment: 'production',
      flags: buildDefaultFeatureFlagSnapshot('production').flags,
    });

    assert.match(etag, /^"[a-f0-9]{16}"$/);
    assert.equal(
      etag,
      buildFeatureFlagEtag({
        catalogVersion: '2',
        storeVersion: 5,
        environment: 'production',
        flags: buildDefaultFeatureFlagSnapshot('production').flags,
      }),
    );
  });
});
