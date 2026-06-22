export class MongoClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "MongoClientError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "MONGO_CLIENT_ERROR";
  }
}

export class MongoNotFoundError extends MongoClientError {
  constructor(resource: string) {
    super(`${resource} not found`, { status: 404, code: "NOT_FOUND" });
    this.name = "MongoNotFoundError";
  }
}

export class MongoDuplicateKeyError extends MongoClientError {
  constructor(field: string) {
    super(`Duplicate value for ${field}`, { status: 409, code: "DUPLICATE_KEY" });
    this.name = "MongoDuplicateKeyError";
  }
}
