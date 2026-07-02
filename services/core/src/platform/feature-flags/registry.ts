import { FEATURE_FLAG_CATALOG } from './catalog';
import { assertUniqueCatalogKeys, validateFeatureFlagDefinition } from './schema';
import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagDefinition,
  type FeatureFlagEnvironment,
  type FeatureFlagKey,
  type FeatureFlagSnapshot,
} from './types';

export const FEATURE_FLAG_CATALOG_VERSION = '1';

let initialized = false;

const mapNodeEnvToEnvironment = (nodeEnv = process.env.NODE_ENV ?? 'production'): FeatureFlagEnvironment => {
  switch (nodeEnv) {
    case 'production':
      return 'production';
    case 'staging':
      return 'staging';
    case 'development':
    case 'test':
      return 'development';
    case 'enterprise-dev':
      return 'enterprise-dev';
    default:
      return 'production';
  }
};

export const resolveFeatureFlagEnvironment = (
  override?: FeatureFlagEnvironment,
): FeatureFlagEnvironment => override ?? mapNodeEnvToEnvironment();

/** Validates catalog entries and rejects duplicate keys — call once at startup. */
export const initializeFeatureFlagCatalog = (): readonly FeatureFlagDefinition[] => {
  if (initialized) {
    return FEATURE_FLAG_CATALOG;
  }

  const validated = FEATURE_FLAG_CATALOG.map((entry, index) =>
    validateFeatureFlagDefinition(entry, index),
  );
  assertUniqueCatalogKeys(validated);

  const catalogKeys = new Set(validated.map((entry) => entry.key));
  for (const key of FEATURE_FLAG_KEYS) {
    if (!catalogKeys.has(key)) {
      throw new Error(`Feature flag catalog missing required key: ${key}`);
    }
  }

  initialized = true;
  return validated;
};

export const getFeatureFlagCatalog = (): readonly FeatureFlagDefinition[] => {
  if (!initialized) {
    return initializeFeatureFlagCatalog();
  }
  return FEATURE_FLAG_CATALOG;
};

export const getFeatureFlagDefinition = (key: FeatureFlagKey): FeatureFlagDefinition => {
  const definition = getFeatureFlagCatalog().find((entry) => entry.key === key);
  if (!definition) {
    throw new Error(`Unknown feature flag key: ${key}`);
  }
  return definition;
};

/** Safe defaults when DB/cache is unavailable — all catalog defaults for the environment. */
export const buildDefaultFeatureFlagSnapshot = (
  environment?: FeatureFlagEnvironment,
): FeatureFlagSnapshot => {
  const resolvedEnvironment = resolveFeatureFlagEnvironment(environment);
  const flags = {} as Record<FeatureFlagKey, boolean>;

  for (const definition of getFeatureFlagCatalog()) {
    flags[definition.key] = definition.defaults[resolvedEnvironment];
  }

  return {
    version: FEATURE_FLAG_CATALOG_VERSION,
    environment: resolvedEnvironment,
    flags,
  };
};

export const isKnownFeatureFlagKey = (key: string): key is FeatureFlagKey =>
  (FEATURE_FLAG_KEYS as readonly string[]).includes(key);
