import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagCategory,
  type FeatureFlagClientSurface,
  type FeatureFlagDefinition,
  type FeatureFlagEnvironment,
  type FeatureFlagKey,
  type FeatureFlagLifecycle,
  type FeatureFlagTier,
} from './types';

const ENVIRONMENTS: readonly FeatureFlagEnvironment[] = [
  'production',
  'staging',
  'development',
  'enterprise-dev',
];

const CATEGORIES: readonly FeatureFlagCategory[] = ['product', 'platform', 'experiment'];

const TIERS: readonly FeatureFlagTier[] = ['personal', 'teams', 'enterprise'];

const CLIENT_SURFACES: readonly FeatureFlagClientSurface[] = [
  'web-app',
  'auth',
  'landing',
  'admin-panel',
  'mobile',
  'browser-extension',
  'mobile-api',
  'admin-api',
];

const LIFECYCLES: readonly FeatureFlagLifecycle[] = ['released', 'unreleased'];

/** JSON Schema (draft-07) for catalog entries — validated at startup. */
export const FEATURE_FLAG_DEFINITION_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: [
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
  ],
  additionalProperties: false,
  properties: {
    key: { type: 'string', enum: [...FEATURE_FLAG_KEYS] },
    displayName: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    owner: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: [...CATEGORIES] },
    tier: { type: 'string', enum: [...TIERS] },
    lifecycle: { type: 'string', enum: [...LIFECYCLES] },
    introducedIn: { type: 'string', minLength: 1 },
    clientSurfaces: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string', enum: [...CLIENT_SURFACES] },
    },
    defaults: {
      type: 'object',
      required: [...ENVIRONMENTS],
      additionalProperties: false,
      properties: Object.fromEntries(ENVIRONMENTS.map((env) => [env, { type: 'boolean' }])),
    },
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFeatureFlagKey = (value: unknown): value is FeatureFlagKey =>
  typeof value === 'string' && (FEATURE_FLAG_KEYS as readonly string[]).includes(value);

export const validateFeatureFlagDefinition = (
  definition: unknown,
  index?: number,
): FeatureFlagDefinition => {
  const prefix = index === undefined ? 'catalog entry' : `catalog entry[${index}]`;

  if (!isRecord(definition)) {
    throw new Error(`${prefix}: expected an object`);
  }

  if (!isFeatureFlagKey(definition.key)) {
    throw new Error(`${prefix}: invalid or missing key`);
  }

  for (const field of ['displayName', 'description', 'owner', 'introducedIn'] as const) {
    if (typeof definition[field] !== 'string' || definition[field].trim().length === 0) {
      throw new Error(`${prefix}: ${field} must be a non-empty string`);
    }
  }

  if (!CATEGORIES.includes(definition.category as FeatureFlagCategory)) {
    throw new Error(`${prefix}: invalid category`);
  }

  if (!TIERS.includes(definition.tier as FeatureFlagTier)) {
    throw new Error(`${prefix}: invalid tier`);
  }

  if (!LIFECYCLES.includes(definition.lifecycle as FeatureFlagLifecycle)) {
    throw new Error(`${prefix}: invalid lifecycle`);
  }

  if (!Array.isArray(definition.clientSurfaces) || definition.clientSurfaces.length === 0) {
    throw new Error(`${prefix}: clientSurfaces must be a non-empty array`);
  }

  const surfaces = new Set<string>();
  for (const surface of definition.clientSurfaces) {
    if (!CLIENT_SURFACES.includes(surface as FeatureFlagClientSurface)) {
      throw new Error(`${prefix}: invalid client surface "${String(surface)}"`);
    }
    if (surfaces.has(String(surface))) {
      throw new Error(`${prefix}: duplicate client surface "${String(surface)}"`);
    }
    surfaces.add(String(surface));
  }

  if (!isRecord(definition.defaults)) {
    throw new Error(`${prefix}: defaults must be an object`);
  }

  for (const env of ENVIRONMENTS) {
    if (typeof definition.defaults[env] !== 'boolean') {
      throw new Error(`${prefix}: defaults.${env} must be a boolean`);
    }
  }

  for (const key of Object.keys(definition.defaults)) {
    if (!ENVIRONMENTS.includes(key as FeatureFlagEnvironment)) {
      throw new Error(`${prefix}: unknown defaults key "${key}"`);
    }
  }

  const displayName = definition.displayName as string;
  const description = definition.description as string;
  const owner = definition.owner as string;
  const introducedIn = definition.introducedIn as string;

  return {
    key: definition.key,
    displayName: displayName.trim(),
    description: description.trim(),
    owner: owner.trim(),
    category: definition.category as FeatureFlagCategory,
    tier: definition.tier as FeatureFlagTier,
    lifecycle: definition.lifecycle as FeatureFlagLifecycle,
    introducedIn: introducedIn.trim(),
    clientSurfaces: definition.clientSurfaces as FeatureFlagClientSurface[],
    defaults: definition.defaults as FeatureFlagDefinition['defaults'],
  };
};

export const assertLifecycleProductionDefaults = (
  definitions: readonly FeatureFlagDefinition[],
): void => {
  for (const definition of definitions) {
    if (definition.lifecycle === 'released' && definition.defaults.production !== true) {
      throw new Error(
        `${definition.key}: released flags must default to true in production`,
      );
    }
    if (definition.lifecycle === 'unreleased' && definition.defaults.production !== false) {
      throw new Error(
        `${definition.key}: unreleased flags must default to false in production`,
      );
    }
  }
};

export const assertUniqueCatalogKeys = (definitions: readonly FeatureFlagDefinition[]): void => {
  const seen = new Set<FeatureFlagKey>();
  for (const definition of definitions) {
    if (seen.has(definition.key)) {
      throw new Error(`Duplicate feature flag key in catalog: ${definition.key}`);
    }
    seen.add(definition.key);
  }
};
