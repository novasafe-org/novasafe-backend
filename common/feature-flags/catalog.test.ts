import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FEATURE_FLAG_CATALOG,
  RELEASED_FEATURE_FLAG_KEYS,
  UNRELEASED_FEATURE_FLAG_KEYS,
} from './catalog';
import {
  assertUniqueCatalogKeys,
  FEATURE_FLAG_DEFINITION_JSON_SCHEMA,
  validateFeatureFlagDefinition,
} from './schema';
import {
  buildDefaultFeatureFlagSnapshot,
  initializeFeatureFlagCatalog,
} from './registry';
import { FEATURE_FLAG_KEYS } from './types';

describe('feature flag catalog', () => {
  it('exposes JSON schema with required catalog fields', () => {
    assert.ok(FEATURE_FLAG_DEFINITION_JSON_SCHEMA.properties.key);
    assert.deepEqual(FEATURE_FLAG_DEFINITION_JSON_SCHEMA.required, [
      'key',
      'displayName',
      'description',
      'owner',
      'category',
      'tier',
      'lifecycle',
      'introducedIn',
      'clientSurfaces',
      'defaults',
    ]);
  });

  it('validates every seeded catalog entry', () => {
    for (const [index, entry] of FEATURE_FLAG_CATALOG.entries()) {
      const validated = validateFeatureFlagDefinition(entry, index);
      assert.equal(validated.key, entry.key);
    }
  });

  it('rejects duplicate keys at startup', () => {
    const duplicate = [
      ...FEATURE_FLAG_CATALOG,
      { ...FEATURE_FLAG_CATALOG[0] },
    ] as typeof FEATURE_FLAG_CATALOG;

    assert.throws(
      () => assertUniqueCatalogKeys(duplicate),
      /Duplicate feature flag key/,
    );
  });

  it('rejects invalid definitions', () => {
    assert.throws(
      () => validateFeatureFlagDefinition({ key: 'unknown-flag' }),
      /invalid or missing key/,
    );
  });

  it('initializes catalog with every canonical key', () => {
    const catalog = initializeFeatureFlagCatalog();
    assert.equal(catalog.length, FEATURE_FLAG_KEYS.length);
    for (const key of FEATURE_FLAG_KEYS) {
      assert.ok(catalog.some((entry) => entry.key === key));
    }
  });

  it('includes released and unreleased feature groups', () => {
    assert.equal(RELEASED_FEATURE_FLAG_KEYS.length, 22);
    assert.equal(UNRELEASED_FEATURE_FLAG_KEYS.length, 11);
    assert.equal(
      RELEASED_FEATURE_FLAG_KEYS.length + UNRELEASED_FEATURE_FLAG_KEYS.length,
      FEATURE_FLAG_KEYS.length,
    );
  });

  it('defaults unreleased flags to false in production', () => {
    const snapshot = buildDefaultFeatureFlagSnapshot('production');
    for (const definition of FEATURE_FLAG_CATALOG) {
      if (definition.lifecycle === 'unreleased') {
        assert.equal(snapshot.flags[definition.key], false);
      }
    }
  });

  it('defaults released flags to true in production', () => {
    const snapshot = buildDefaultFeatureFlagSnapshot('production');
    for (const definition of FEATURE_FLAG_CATALOG) {
      if (definition.lifecycle === 'released') {
        assert.equal(snapshot.flags[definition.key], true);
      }
    }
  });
});
