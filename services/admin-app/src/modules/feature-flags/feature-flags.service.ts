import {
  FEATURE_FLAG_CATALOG,
  FEATURE_FLAG_CATALOG_VERSION,
  type FeatureFlagEnvironment,
  type FeatureFlagKey,
  getFeatureFlagCatalog,
  getFeatureFlagDefinition,
  initializeFeatureFlagCatalog,
  isKnownFeatureFlagKey,
} from '@novasafe/feature-flags';

import { ADMIN_COLLECTIONS, getDb } from '../../database/mongo';
import type {
  FeatureFlagAuditAction,
  FeatureFlagAuditRecord,
  FeatureFlagRecord,
  FeatureFlagRowDto,
  FeatureFlagSnapshotDto,
} from './feature-flags.types';

const ENVIRONMENTS: readonly FeatureFlagEnvironment[] = [
  'production',
  'staging',
  'development',
  'enterprise-dev',
];

let storeVersion = 1;

export const getFeatureFlagStoreVersion = (): number => storeVersion;

export async function ensureFeatureFlagIndexes(): Promise<void> {
  initializeFeatureFlagCatalog();
  const db = getDb();
  await Promise.all([
    db
      .collection(ADMIN_COLLECTIONS.featureFlags)
      .createIndex({ key: 1, environment: 1 }, { unique: true }),
    db.collection(ADMIN_COLLECTIONS.featureFlags).createIndex({ environment: 1, updatedAt: -1 }),
    db.collection(ADMIN_COLLECTIONS.featureFlagAudit).createIndex({ key: 1, createdAt: -1 }),
    db.collection(ADMIN_COLLECTIONS.featureFlagAudit).createIndex({ environment: 1, createdAt: -1 }),
  ]);
}

export async function seedFeatureFlagsFromCatalog(): Promise<void> {
  initializeFeatureFlagCatalog();
  const db = getDb();
  const now = new Date();
  const collection = db.collection<Omit<FeatureFlagRecord, '_id'>>(ADMIN_COLLECTIONS.featureFlags);

  for (const definition of FEATURE_FLAG_CATALOG) {
    for (const environment of ENVIRONMENTS) {
      const enabled = definition.defaults[environment];
      await collection.updateOne(
        { key: definition.key, environment },
        {
          $setOnInsert: {
            key: definition.key,
            environment,
            enabled,
            rolloutPercent: 100,
            allowedUserIds: [],
            version: 1,
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        { upsert: true },
      );
    }
  }
}

function parseEnvironment(value: unknown): FeatureFlagEnvironment {
  const raw = String(value ?? 'production');
  if (ENVIRONMENTS.includes(raw as FeatureFlagEnvironment)) {
    return raw as FeatureFlagEnvironment;
  }
  throw new Error(`Invalid environment: ${raw}`);
}

async function bumpStoreVersion(): Promise<number> {
  storeVersion += 1;
  return storeVersion;
}

async function writeAuditEntry(input: {
  key: FeatureFlagKey;
  environment: FeatureFlagEnvironment;
  action: FeatureFlagAuditAction;
  oldValue: { enabled: boolean };
  newValue: { enabled: boolean };
  actorId: string;
  actorEmail: string;
}): Promise<void> {
  const db = getDb();
  await db.collection<Omit<FeatureFlagAuditRecord, '_id'>>(ADMIN_COLLECTIONS.featureFlagAudit).insertOne({
    ...input,
    createdAt: new Date(),
  });
}

function toRowDto(
  key: FeatureFlagKey,
  record: FeatureFlagRecord | null,
  environment: FeatureFlagEnvironment,
): FeatureFlagRowDto {
  const definition = getFeatureFlagDefinition(key);
  return {
    key: definition.key,
    displayName: definition.displayName,
    description: definition.description,
    category: definition.category,
    tier: definition.tier,
    lifecycle: definition.lifecycle,
    clientSurfaces: [...definition.clientSurfaces],
    environment,
    enabled: record?.enabled ?? definition.defaults[environment],
    catalogDefault: definition.defaults[environment],
    version: record?.version ?? 1,
    updatedAt: record?.updatedAt?.toISOString() ?? null,
    updatedBy: record?.updatedBy ?? null,
    updatedByEmail: record?.updatedByEmail ?? null,
  };
}

export async function listFeatureFlagRows(environmentInput?: string): Promise<FeatureFlagRowDto[]> {
  initializeFeatureFlagCatalog();
  const environment = environmentInput ? parseEnvironment(environmentInput) : 'production';
  const db = getDb();
  const records = await db
    .collection<FeatureFlagRecord>(ADMIN_COLLECTIONS.featureFlags)
    .find({ environment })
    .toArray();
  const byKey = new Map(records.map((record) => [record.key, record]));

  return getFeatureFlagCatalog().map((definition) =>
    toRowDto(definition.key, byKey.get(definition.key) ?? null, environment),
  );
}

export async function getFeatureFlagRowsByKey(keyInput: string): Promise<FeatureFlagRowDto[]> {
  if (!isKnownFeatureFlagKey(keyInput)) {
    throw new Error(`Unknown feature flag key: ${keyInput}`);
  }
  const db = getDb();
  const records = await db
    .collection<FeatureFlagRecord>(ADMIN_COLLECTIONS.featureFlags)
    .find({ key: keyInput })
    .toArray();
  const byEnv = new Map(records.map((record) => [record.environment, record]));
  const definition = getFeatureFlagDefinition(keyInput);

  return ENVIRONMENTS.map((environment) =>
    toRowDto(keyInput, byEnv.get(environment) ?? null, environment),
  );
}

export async function getFeatureFlagSnapshot(environmentInput?: string): Promise<FeatureFlagSnapshotDto> {
  const rows = await listFeatureFlagRows(environmentInput);
  const environment = rows[0]?.environment ?? parseEnvironment(environmentInput);
  const flags = {} as Record<FeatureFlagKey, boolean>;
  for (const row of rows) {
    flags[row.key] = row.enabled;
  }
  const maxVersion = rows.reduce((max, row) => Math.max(max, row.version), 1);

  return {
    catalogVersion: FEATURE_FLAG_CATALOG_VERSION,
    storeVersion: Math.max(maxVersion, storeVersion),
    environment,
    flags,
  };
}

export async function toggleFeatureFlag(input: {
  key: string;
  environment: string;
  enabled: boolean;
  actorId: string;
  actorEmail: string;
}): Promise<FeatureFlagRowDto> {
  if (!isKnownFeatureFlagKey(input.key)) {
    throw new Error(`Unknown feature flag key: ${input.key}`);
  }
  const environment = parseEnvironment(input.environment);
  const db = getDb();
  const collection = db.collection<FeatureFlagRecord>(ADMIN_COLLECTIONS.featureFlags);
  const existing = await collection.findOne({ key: input.key, environment });
  const oldEnabled = existing?.enabled ?? getFeatureFlagDefinition(input.key).defaults[environment];

  if (oldEnabled === input.enabled) {
    return toRowDto(input.key, existing, environment);
  }

  const version = await bumpStoreVersion();
  const now = new Date();
  await collection.updateOne(
    { key: input.key, environment },
    {
      $set: {
        enabled: input.enabled,
        version,
        updatedBy: input.actorId,
        updatedByEmail: input.actorEmail,
        updatedAt: now,
      },
      $setOnInsert: {
        key: input.key,
        environment,
        rolloutPercent: 100,
        allowedUserIds: [],
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await writeAuditEntry({
    key: input.key,
    environment,
    action: 'toggle',
    oldValue: { enabled: oldEnabled },
    newValue: { enabled: input.enabled },
    actorId: input.actorId,
    actorEmail: input.actorEmail,
  });

  const updated = await collection.findOne({ key: input.key, environment });
  return toRowDto(input.key, updated, environment);
}

export async function bulkUpdateFeatureFlags(input: {
  environment: string;
  flags: Record<string, boolean>;
  actorId: string;
  actorEmail: string;
}): Promise<FeatureFlagSnapshotDto> {
  const environment = parseEnvironment(input.environment);

  for (const key of Object.keys(input.flags)) {
    if (!isKnownFeatureFlagKey(key)) {
      throw new Error(`Unknown feature flag key: ${key}`);
    }
    await toggleFeatureFlag({
      key,
      environment,
      enabled: Boolean(input.flags[key]),
      actorId: input.actorId,
      actorEmail: input.actorEmail,
    });
  }

  return getFeatureFlagSnapshot(environment);
}

export async function listFeatureFlagAudit(
  keyInput: string,
  environmentInput?: string,
  limit = 50,
): Promise<FeatureFlagAuditRecord[]> {
  if (!isKnownFeatureFlagKey(keyInput)) {
    throw new Error(`Unknown feature flag key: ${keyInput}`);
  }
  const query: Record<string, unknown> = { key: keyInput };
  if (environmentInput) {
    query.environment = parseEnvironment(environmentInput);
  }

  return getDb()
    .collection<FeatureFlagAuditRecord>(ADMIN_COLLECTIONS.featureFlagAudit)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray();
}
