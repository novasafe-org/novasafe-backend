import { ObjectId } from "../../../database/object-id";
import { COLLECTIONS } from "../../../database/collections";
import { getNativeMongo } from "../../../database/adapters/native-mongo.adapter";
import type { SubscriptionEventRecord, SubscriptionState } from "./types";
import {
  resolveWebhookClaimOutcome,
  STALE_PROCESSING_MS,
  type WebhookClaimOutcome,
  type WebhookEventSnapshot,
} from "./webhook-idempotency";

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

function toWebhookEventSnapshot(doc: Record<string, unknown>): WebhookEventSnapshot {
  return {
    status: doc.status as SubscriptionEventRecord["status"],
    processedAt: doc.processedAt as Date,
    createdAt: doc.createdAt as Date,
  };
}

export async function findWebhookEventByEventId(eventId: string): Promise<WebhookEventSnapshot | null> {
  const doc = await db.findOne(COLLECTIONS.subscriptionEvents, { eventId });
  if (!doc) return null;
  return toWebhookEventSnapshot(doc as Record<string, unknown>);
}

function buildEventDocument(
  record: Omit<SubscriptionEventRecord, "processedAt" | "createdAt">,
  now: Date,
): Record<string, unknown> {
  return {
    ...record,
    userId: record.userId && ObjectId.isValid(record.userId) ? new ObjectId(record.userId) : null,
    processedAt: now,
    createdAt: now,
  };
}

async function reclaimWebhookEventForRetry(
  record: Omit<SubscriptionEventRecord, "processedAt" | "createdAt">,
): Promise<boolean> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
  const result = await db
    .getDb()
    .collection(COLLECTIONS.subscriptionEvents)
    .updateOne(
      {
        eventId: record.eventId,
        $or: [
          { status: "failed" },
          { status: "processing", processedAt: { $lt: staleCutoff } },
        ],
      },
      {
        $set: {
          status: "processing",
          eventType: record.eventType,
          userId:
            record.userId && ObjectId.isValid(record.userId) ? new ObjectId(record.userId) : null,
          transactionId: record.transactionId,
          payload: record.payload,
          errorMessage: null,
          processedAt: now,
        },
      },
    );
  return result.modifiedCount > 0;
}

/**
 * Claims a webhook event for processing with retry-safe idempotency.
 *
 * - `new` — first claim; event inserted as `processing`.
 * - `duplicate` — terminal (`completed`/`ignored`) or concurrent in-flight processing.
 * - `retry` — prior `failed` or stale `processing` claim reclaimed for reprocessing.
 */
export async function claimWebhookEventForProcessing(
  record: Omit<SubscriptionEventRecord, "processedAt" | "createdAt">,
): Promise<WebhookClaimOutcome> {
  const existing = await findWebhookEventByEventId(record.eventId);
  const decision = resolveWebhookClaimOutcome(existing);

  if (decision === "duplicate") return "duplicate";

  if (decision === "new") {
    try {
      await db.insertOne(
        COLLECTIONS.subscriptionEvents,
        buildEventDocument(record, new Date()),
      );
      return "new";
    } catch (error: unknown) {
      const msg = String((error as { message?: string })?.message || "");
      if (!msg.includes("E11000")) throw error;
      const raced = await findWebhookEventByEventId(record.eventId);
      return resolveWebhookClaimOutcome(raced) === "retry"
        ? claimWebhookEventForProcessing(record)
        : "duplicate";
    }
  }

  const reclaimed = await reclaimWebhookEventForRetry(record);
  if (reclaimed) return "retry";

  return "duplicate";
}

/**
 * @deprecated Prefer `claimWebhookEventForProcessing` for processing flows.
 * Retained for terminal `ignored` inserts where retry is not required.
 */
export async function claimWebhookEvent(
  record: Omit<SubscriptionEventRecord, "processedAt" | "createdAt">,
): Promise<"new" | "duplicate"> {
  const outcome = await claimWebhookEventForProcessing(record);
  if (outcome === "retry") return "new";
  return outcome === "new" ? "new" : "duplicate";
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

export async function listPurchaseHistoryForUser(
  userId: string,
  limit = 25,
): Promise<
  Array<{
    eventId: string;
    eventType: string;
    productId: string | null;
    transactionId: string | null;
    store: string | null;
    environment: string | null;
    purchasedAt: string | null;
  }>
> {
  const rows = await db.findMany(
    COLLECTIONS.purchaseHistory,
    { userId: new ObjectId(userId) },
    { limit, sort: { purchasedAt: -1, createdAt: -1 } },
  );
  return (rows || []).map((row: Record<string, unknown>) => ({
    eventId: String(row?.eventId || ""),
    eventType: String(row?.eventType || "UNKNOWN"),
    productId: row?.productId ? String(row.productId) : null,
    transactionId: row?.transactionId ? String(row.transactionId) : null,
    store: row?.store ? String(row.store) : null,
    environment: row?.environment ? String(row.environment) : null,
    purchasedAt: row?.purchasedAt
      ? new Date(row.purchasedAt as Date).toISOString()
      : row?.createdAt
        ? new Date(row.createdAt as Date).toISOString()
        : null,
  }));
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
