import { ObjectId } from "../../../database/object-id";
import { COLLECTIONS } from "../../../database/collections";
import { getNativeMongo } from "../../../database/adapters/native-mongo.adapter";
import type { SubscriptionEventRecord, SubscriptionState } from "./types";

const db = getNativeMongo();

export async function ensureSubscriptionIndexes(): Promise<void> {
  
  const dbc = db.getDb();
  await Promise.all([
    dbc.collection(COLLECTIONS.subscriptions).createIndex({ userId: 1 }, { unique: true }),
    dbc.collection(COLLECTIONS.subscriptionEvents).createIndex({ eventId: 1 }, { unique: true }),
    dbc.collection(COLLECTIONS.subscriptionEvents).createIndex({ userId: 1, processedAt: -1 }),
    dbc.collection(COLLECTIONS.subscriptionEvents).createIndex({ transactionId: 1 }, { sparse: true }),
    dbc.collection(COLLECTIONS.purchaseHistory).createIndex({ userId: 1, createdAt: -1 }),
    dbc
      .collection(COLLECTIONS.purchaseHistory)
      .createIndex({ transactionId: 1 }, { unique: true, sparse: true }),
  ]);
}

export async function findVaultUserById(userId: string) {
  if (!ObjectId.isValid(userId)) return null;
  return db.findOne(COLLECTIONS.vaultUsers, {
    _id: new ObjectId(userId),
    deleted: { $ne: true },
  });
}

export async function getPersistedSubscriptionState(userId: string): Promise<SubscriptionState | null> {
  const stored = await db.findOne(COLLECTIONS.subscriptions, {
    userId: new ObjectId(userId),
  });
  if (!stored?.state) return null;
  return stored.state as SubscriptionState;
}

export async function persistSubscriptionState(userId: string, state: SubscriptionState): Promise<void> {
  await db
    .getDb()
    .collection(COLLECTIONS.subscriptions)
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
    await db.insertOne(COLLECTIONS.subscriptionEvents, {
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
    .collection(COLLECTIONS.subscriptionEvents)
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
    await db.insertOne(COLLECTIONS.purchaseHistory, {
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
    COLLECTIONS.subscriptionEvents,
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
