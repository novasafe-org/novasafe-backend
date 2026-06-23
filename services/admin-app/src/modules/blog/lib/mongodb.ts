import type { Db } from "mongodb";

import { getDb } from "../../../database/mongo";
import { buildMongoUri, getConfig } from "@/types/config";

/**
 * Reuses the admin-app MongoDB connection (connected in server.ts).
 * Avoids a second MongoClient pool — important on memory-constrained VPS hosts.
 */
export async function getMongoDatabase(): Promise<Db> {
  try {
    return getDb();
  } catch {
    // Fallback for isolated scripts / tests only
    const { MongoClient } = await import("mongodb");
    const config = getConfig();
    const client = new MongoClient(buildMongoUri(config));
    await client.connect();
    return client.db(config.DATABASE_NAME);
  }
}

export function isMongoConfigured(): boolean {
  return Boolean(
    process.env.MONGODB_USERNAME?.trim() &&
      process.env.MONGODB_PASSWORD?.trim() &&
      process.env.MONGODB_HOST?.trim() &&
      process.env.DATABASE_NAME?.trim(),
  );
}

export async function closeMongoConnection(): Promise<void> {
  // Connection lifecycle owned by admin-app database/mongo.ts
}
