import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { initializeFeatureFlagCatalog } from '@novasafe/feature-flags';

import { assertEnterpriseProductionApproval } from './approval';

describe('assertEnterpriseProductionApproval', () => {
  it('requires approval note when enabling enterprise tier in production', () => {
    initializeFeatureFlagCatalog();
    assert.throws(
      () =>
        assertEnterpriseProductionApproval({
          key: 'enterprise',
          environment: 'production',
          enabled: true,
        }),
      /approval note/i,
    );
  });

  it('allows enterprise production disable without approval note', () => {
    initializeFeatureFlagCatalog();
    assert.doesNotThrow(() =>
      assertEnterpriseProductionApproval({
        key: 'enterprise',
        environment: 'production',
        enabled: false,
      }),
    );
  });

  it('allows enterprise enable in staging without approval note', () => {
    initializeFeatureFlagCatalog();
    assert.doesNotThrow(() =>
      assertEnterpriseProductionApproval({
        key: 'enterprise',
        environment: 'staging',
        enabled: true,
      }),
    );
  });
});
