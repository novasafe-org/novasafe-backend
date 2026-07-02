import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDefaultFeatureFlagSnapshot,
  initializeFeatureFlagCatalog,
} from '@novasafe/feature-flags';

import {
  buildFeatureFlagEtag,
  clearFeatureFlagCache,
  resolveClientFeatureFlags,
} from './store';

describe('resolveClientFeatureFlags', () => {
  it('returns catalog defaults when Mongo is unavailable', async () => {
    clearFeatureFlagCache();
    initializeFeatureFlagCatalog();
    const expected = buildDefaultFeatureFlagSnapshot('production');

    const snapshot = await resolveClientFeatureFlags('production');

    assert.equal(snapshot.environment, 'production');
    assert.deepEqual(snapshot.flags, expected.flags);
    assert.equal(snapshot.catalogVersion, expected.version);
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
