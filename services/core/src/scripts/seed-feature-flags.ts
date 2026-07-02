#!/usr/bin/env tsx
/**
 * Prints the canonical feature flag catalog as JSON for admin-api seeding (NS-61).
 * Usage: pnpm --filter core-service run seed:feature-flags
 */
import { FEATURE_FLAG_CATALOG } from '../platform/feature-flags/catalog';
import {
  FEATURE_FLAG_CATALOG_VERSION,
  initializeFeatureFlagCatalog,
} from '../platform/feature-flags/registry';

initializeFeatureFlagCatalog();

const payload = {
  version: FEATURE_FLAG_CATALOG_VERSION,
  catalog: FEATURE_FLAG_CATALOG,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
