import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { ObjectId } from '../../../database/object-id';
import type { CreateStatusServiceInput, StatusServiceRecord } from '../types/status-page.types';
import { normalizeServiceKey } from '../utils/status-page.util';

const db = getNativeMongo();
const col = COLLECTIONS.statusServices;

export async function ensureStatusServiceIndexes(): Promise<void> {
  const dbc = db.getDb().collection(col);
  await Promise.all([
    dbc.createIndex({ key: 1 }, { unique: true }),
    dbc.createIndex({ isActive: 1, isPublic: 1 }),
  ]);
}

export async function seedDefaultStatusServices(): Promise<void> {
  const now = new Date();
  const existing = await db.findOne(col, { key: 'api' });
  if (existing) return;

  await db.insertOne(col, {
    key: 'api',
    name: 'API',
    description: 'NovaSafe Backend API',
    isPublic: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function findAllServices(filter: { publicOnly?: boolean; activeOnly?: boolean } = {}) {
  const query: Record<string, unknown> = {};
  if (filter.publicOnly) query.isPublic = true;
  if (filter.activeOnly) query.isActive = true;
  return db.findMany(col, query, { sort: { name: 1 } }) as Promise<StatusServiceRecord[]>;
}

export async function findServiceById(id: string | ObjectId) {
  const oid = typeof id === 'string' ? new ObjectId(id) : id;
  return db.findOne(col, { _id: oid }) as Promise<StatusServiceRecord | null>;
}

export async function findServiceByKey(key: string) {
  return db.findOne(col, { key: normalizeServiceKey(key) }) as Promise<StatusServiceRecord | null>;
}

export async function insertService(input: CreateStatusServiceInput): Promise<StatusServiceRecord> {
  const now = new Date();
  const key = normalizeServiceKey(input.key);
  const doc = {
    key,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    isPublic: input.isPublic ?? true,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.insertOne(col, doc);
  return { _id: result.insertedId, ...doc } as StatusServiceRecord;
}

export async function countServices(query: Record<string, unknown> = {}) {
  return db.getDb().collection(col).countDocuments(query);
}
