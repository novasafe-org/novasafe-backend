import { ObjectId } from "mongodb";
import { DB_CONFIG } from "../config/dbConfig";
import Database from "../database/connection";
import type { SubscriptionEventRecord, SubscriptionState } from "./types";

const db = new Database(DB_CONFIG.databaseName);

export async function ensureSubscriptionIndexes(): Promise<void> {
  await db.connect();
  const dbc = db.getDb();
  await Promise.all([
    dbc.collection(DB_CONFIG.collections.subscriptions).createIndex({ userId: 1 }, { unique: true }),
    dbc.collection(DB_CONFIG.collections.subscriptionEvents).createIndex({ eventId: 1 }, { unique: true }),
    dbc.collection(DB_CONFIG.collections.subscriptionEvents).createIndex({ userId: 1, processedAt: -1 }),
    dbc.collection(DB_CONFIG.collections.subscriptionEvents).createIndex({ transactionId: 1 }, { sparse: true }),
    dbc.collection(DB_CONFIG.collections.purchaseHistory).createIndex({ userId: 1, createdAt: -1 }),
    dbc
      .collection(DB_CONFIG.collections.purchaseHistory)
      .createIndex({ transactionId: 1 }, { unique: true, sparse: true }),
  ]);
}

export async function findVaultUserById(userId: string) {
  if (!ObjectId.isValid(userId)) return null;
  return db.findOne(DB_CONFIG.collections.vaultUsers, {
    _id: new ObjectId(userId),
    deleted: { $ne: true },
  });
}

export async function getPersistedSubscriptionState(userId: string): Promise<SubscriptionState | null> {
  const stored = await db.findOne(DB_CONFIG.collections.subscriptions, {
    userId: new ObjectId(userId),
  });
  if (!stored?.state) return null;
  return stored.state as SubscriptionState;
}

export async function persistSubscriptionState(userId: string, state: SubscriptionState): Promise<void> {
  await db
    .getDb()
    .collection(DB_CONFIG.collections.subscriptions)
    .updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: {
          userId: new ObjectId(userId),
          state,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
}

/**
 * Atomically claims a webhook event for processing (idempotent).
 * Returns `duplicate` if event_id was already recorded.
 */
export async function claimWebhookEvent(
  record: Omit<SubscriptionEventRecord, "processedAt" | "createdAt">,
): Promise<"new" | "duplicate"> {
  try {
    await db.insertOne(DB_CONFIG.collections.subscriptionEvents, {
      ...record,
      userId: record.userId && ObjectId.isValid(record.userId) ? new ObjectId(record.userId) : null,
      processedAt: new Date(),
      createdAt: new Date(),
    });
    return "new";
  } catch (error: unknown) {
    const msg = String((error as { message?: string })?.message || "");
    if (msg.includes("E11000")) return "duplicate";
    throw error;
  }
}

export async function finalizeWebhookEvent(
  eventId: string,
  update: Pick<SubscriptionEventRecord, "status" | "errorMessage">,
): Promise<void> {
  await db
    .getDb()
    .collection(DB_CONFIG.collections.subscriptionEvents)
    .updateOne(
      { eventId },
      {
        $set: {
          status: update.status,
          errorMessage: update.errorMessage ?? null,
          processedAt: new Date(),
        },
      },
    );
}

export async function recordPurchaseHistory(input: {
  userId: string;
  eventId: string;
  eventType: string;
  productId: string | null;
  transactionId: string | null;
  store: string | null;
  environment: string | null;
  purchasedAt: Date | null;
}): Promise<void> {
  if (!input.transactionId) return;
  try {
    await db.insertOne(DB_CONFIG.collections.purchaseHistory, {
      userId: new ObjectId(input.userId),
      eventId: input.eventId,
      eventType: input.eventType,
      productId: input.productId,
      transactionId: input.transactionId,
      store: input.store,
      environment: input.environment,
      purchasedAt: input.purchasedAt,
      createdAt: new Date(),
    });
  } catch (error: unknown) {
    const msg = String((error as { message?: string })?.message || "");
    if (msg.includes("E11000")) return;
    throw error;
  }
}

export async function listSubscriptionEventsForUser(
  userId: string,
  limit = 25,
): Promise<Array<{ eventId: string; eventType: string; processedAt: string | null; status?: string }>> {
  const events = await db.findMany(
    DB_CONFIG.collections.subscriptionEvents,
    { userId: new ObjectId(userId) },
    { limit, sort: { processedAt: -1 } },
  );
  return (events || []).map((e: Record<string, unknown>) => ({
    eventId: String(e?.eventId || ""),
    eventType: String(e?.eventType || "UNKNOWN"),
    status: e?.status ? String(e.status) : undefined,
    processedAt: e?.processedAt ? new Date(e.processedAt as Date).toISOString() : null,
  }));
}
