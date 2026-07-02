#!/usr/bin/env tsx
/**
 * Prints the canonical feature flag catalog as JSON for admin-api seeding (NS-61).
 * Usage: pnpm --filter core-service run seed:feature-flags
 */
import { FEATURE_FLAG_CATALOG } from '@novasafe/feature-flags';
import {
  FEATURE_FLAG_CATALOG_VERSION,
  initializeFeatureFlagCatalog,
} from '@novasafe/feature-flags';

initializeFeatureFlagCatalog();

const payload = {
  version: FEATURE_FLAG_CATALOG_VERSION,
  catalog: FEATURE_FLAG_CATALOG,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
