import { getMongoDatabase } from "@/lib/mongodb";
import { createNativeMongoClient } from "@/repositories/client/native-mongo.client";
import { createMongoRepositories } from "@/repositories/index";
import type { MongoRepositories } from "@/repositories/types";

export async function getRepositories(): Promise<MongoRepositories> {
  const db = await getMongoDatabase();
  return createMongoRepositories(createNativeMongoClient(db));
}
