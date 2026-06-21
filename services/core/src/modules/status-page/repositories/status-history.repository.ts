import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { ObjectId } from '../../../database/object-id';
import type { DailySnapshotStatus, StatusSnapshotRecord } from '../types/status-page.types';

const db = getNativeMongo();
const col = COLLECTIONS.statusSnapshots;

export async function ensureStatusSnapshotIndexes(): Promise<void> {
  const dbc = db.getDb().collection(col);
  await dbc.createIndex({ serviceId: 1, date: 1 }, { unique: true });
}

export async function findSnapshot(serviceId: ObjectId, date: string) {
  return db.findOne(col, { serviceId, date }) as Promise<StatusSnapshotRecord | null>;
}

export async function upsertSnapshot(
  serviceId: ObjectId,
  date: string,
  status: DailySnapshotStatus,
  uptimePercentage: number,
) {
  const now = new Date();
  await db
    .getDb()
    .collection(col)
    .updateOne(
      { serviceId, date },
      {
        $set: {
          status,
          uptimePercentage,
          updatedAt: now,
        },
        $setOnInsert: {
          serviceId,
          date,
          createdAt: now,
        },
      },
      { upsert: true },
    );
}

export async function findSnapshotsInRange(serviceId: ObjectId, fromDate: string, toDate: string) {
  return db.findMany(
    col,
    {
      serviceId,
      date: { $gte: fromDate, $lte: toDate },
    },
    { sort: { date: 1 } },
  ) as Promise<StatusSnapshotRecord[]>;
}

export async function listSnapshotDates(serviceId: ObjectId, limitDays: number) {
  return db.findMany(
    col,
    { serviceId },
    { sort: { date: -1 }, limit: limitDays },
  ) as Promise<StatusSnapshotRecord[]>;
}
