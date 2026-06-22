import { AppError } from "@/lib/errors";
import { ERROR_CODES, HTTP } from "@/lib/constants";
import { isMongoConfigured } from "@/lib/mongodb";
import { getRepositories } from "@/repositories/factory";
import type { MongoRepositories } from "@/repositories/types";

export class ServiceUnavailableError extends AppError {
  constructor(message = "MongoDB is not configured") {
    super(message, { status: HTTP.SERVICE_UNAVAILABLE, code: ERROR_CODES.SERVICE_UNAVAILABLE });
    this.name = "ServiceUnavailableError";
  }
}

export async function requireMongo(): Promise<MongoRepositories> {
  if (!isMongoConfigured()) {
    throw new ServiceUnavailableError();
  }

  try {
    return await getRepositories();
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError(
      error instanceof Error ? error.message : "MongoDB connection failed",
    );
  }
}
