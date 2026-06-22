import { MongoClient, type Db } from "mongodb";
import { buildMongoUri, getConfig } from "@/types/config";

type MongoCache = {
  client: MongoClient;
  db: Db;
  connectPromise: Promise<MongoClient>;
};

declare global {
  // eslint-disable-next-line no-var
  var __novasafeMongoCache: MongoCache | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(
    process.env.MONGODB_USERNAME?.trim() &&
      process.env.MONGODB_PASSWORD?.trim() &&
      process.env.MONGODB_HOST?.trim() &&
      process.env.DATABASE_NAME?.trim(),
  );
}

/**
 * Serverless-safe MongoDB singleton.
 * Reuses the TCP connection across warm invocations in the same isolate.
 */
export async function getMongoDatabase(): Promise<Db> {
  const config = getConfig();
  const uri = buildMongoUri(config);
  const { DATABASE_NAME } = config;

  if (!globalThis.__novasafeMongoCache) {
    const client = new MongoClient(uri);
    globalThis.__novasafeMongoCache = {
      client,
      db: client.db(DATABASE_NAME),
      connectPromise: client.connect(),
    };
  }

  await globalThis.__novasafeMongoCache.connectPromise;
  return globalThis.__novasafeMongoCache.db;
}

export async function closeMongoConnection(): Promise<void> {
  if (globalThis.__novasafeMongoCache) {
    await globalThis.__novasafeMongoCache.client.close();
    globalThis.__novasafeMongoCache = undefined;
  }
}
