import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_FLAG_KEYS,
  initializeFeatureFlagCatalog,
  isKnownFeatureFlagKey,
} from '@novasafe/feature-flags';

describe('feature flag catalog bridge', () => {
  it('initializes shared catalog package', () => {
    const catalog = initializeFeatureFlagCatalog();
    assert.equal(catalog.length, FEATURE_FLAG_KEYS.length);
  });

  it('recognizes catalog keys', () => {
    assert.equal(isKnownFeatureFlagKey('vault'), true);
    assert.equal(isKnownFeatureFlagKey('teams'), true);
    assert.equal(isKnownFeatureFlagKey('not-a-flag'), false);
  });
});
