import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { ObjectId } from '../../../database/object-id';
import type {
  CreateStatusIncidentInput,
  IncidentStatus,
  StatusIncidentRecord,
  UpdateStatusIncidentInput,
} from '../types/status-page.types';
import { buildIncidentSlug } from '../utils/status-page.util';

const db = getNativeMongo();
const col = COLLECTIONS.statusIncidents;

export async function ensureStatusIncidentIndexes(): Promise<void> {
  const dbc = db.getDb().collection(col);
  await Promise.all([
    dbc.createIndex({ slug: 1 }, { unique: true }),
    dbc.createIndex({ serviceId: 1, startedAt: -1 }),
    dbc.createIndex({ serviceId: 1, resolvedAt: 1, status: 1 }),
    dbc.createIndex({ isPublic: 1, startedAt: -1 }),
  ]);
}

const activeIncidentFilter = {
  resolvedAt: null,
  status: { $ne: 'resolved' as IncidentStatus },
};

export async function findActiveIncidents(filter: {
  serviceId?: ObjectId;
  publicOnly?: boolean;
} = {}) {
  const query: Record<string, unknown> = { ...activeIncidentFilter };
  if (filter.serviceId) query.serviceId = filter.serviceId;
  if (filter.publicOnly) query.isPublic = true;
  return db.findMany(col, query, { sort: { startedAt: -1 } }) as Promise<StatusIncidentRecord[]>;
}

export async function findIncidentsOverlappingWindow(
  serviceId: ObjectId,
  windowStart: Date,
  windowEnd: Date,
) {
  return db.findMany(
    col,
    {
      serviceId,
      severity: { $ne: 'maintenance' },
      startedAt: { $lte: windowEnd },
      $or: [{ resolvedAt: null }, { resolvedAt: { $gte: windowStart } }],
    },
    { sort: { startedAt: 1 } },
  ) as Promise<StatusIncidentRecord[]>;
}

export async function findAllIncidentsForHistory(
  serviceId: ObjectId,
  since: Date,
  publicOnly: boolean,
) {
  const query: Record<string, unknown> = {
    serviceId,
    startedAt: { $lte: new Date() },
    $or: [{ resolvedAt: null }, { resolvedAt: { $gte: since } }],
  };
  if (publicOnly) query.isPublic = true;
  return db.findMany(col, query, { sort: { startedAt: -1 } }) as Promise<StatusIncidentRecord[]>;
}

export async function findIncidentById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return db.findOne(col, { _id: new ObjectId(id) }) as Promise<StatusIncidentRecord | null>;
}

export async function findIncidentBySlug(slug: string, publicOnly = false) {
  const query: Record<string, unknown> = { slug: slug.trim().toLowerCase() };
  if (publicOnly) query.isPublic = true;
  return db.findOne(col, query) as Promise<StatusIncidentRecord | null>;
}

export async function listPublicIncidents(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const query = { isPublic: true };
  const [items, total] = await Promise.all([
    db.findMany(col, query, { skip, limit, sort: { startedAt: -1 } }),
    db.getDb().collection(col).countDocuments(query),
  ]);
  return { items: items as StatusIncidentRecord[], total };
}

export async function insertIncident(
  serviceId: ObjectId,
  input: CreateStatusIncidentInput,
  createdBy: ObjectId | null,
): Promise<StatusIncidentRecord> {
  const now = new Date();
  const startedAt = input.startedAt ?? now;
  let slug = buildIncidentSlug(input.title, startedAt);
  let suffix = 1;
  while (await findIncidentBySlug(slug)) {
    slug = `${buildIncidentSlug(input.title, startedAt)}-${suffix}`;
    suffix += 1;
  }

  const doc = {
    serviceId,
    title: input.title.trim(),
    slug,
    status: input.status ?? 'investigating',
    severity: input.severity,
    description: input.description?.trim() || undefined,
    publicMessage: input.publicMessage?.trim() || undefined,
    startedAt,
    resolvedAt: null,
    isPublic: input.isPublic ?? true,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.insertOne(col, doc);
  return { _id: result.insertedId, ...doc } as StatusIncidentRecord;
}

export async function updateIncidentById(id: string, patch: UpdateStatusIncidentInput) {
  if (!ObjectId.isValid(id)) return null;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.severity !== undefined) update.severity = patch.severity;
  if (patch.description !== undefined) update.description = patch.description.trim() || undefined;
  if (patch.publicMessage !== undefined) update.publicMessage = patch.publicMessage.trim() || undefined;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.startedAt !== undefined) update.startedAt = patch.startedAt;
  if (patch.isPublic !== undefined) update.isPublic = patch.isPublic;

  await db.updateOne(col, { _id: new ObjectId(id) }, { $set: update });
  return findIncidentById(id);
}

export async function resolveIncidentById(id: string, resolvedAt = new Date()) {
  if (!ObjectId.isValid(id)) return null;
  await db.updateOne(
    col,
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'resolved',
        resolvedAt,
        updatedAt: new Date(),
      },
    },
  );
  return findIncidentById(id);
}
