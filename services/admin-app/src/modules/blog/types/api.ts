export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
};

export type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type MongoHealthCheck = {
  configured: boolean;
  connected: boolean;
  host: string | null;
  database: string;
  error?: string;
};

export type HealthChecks = {
  mongodb: MongoHealthCheck;
  auth: {
    jwtConfigured: boolean;
    adminLoginConfigured: boolean;
    issuer: string;
    audience: string;
  };
  media: {
    provider: "local";
    storagePath: string;
    maxBytes: number;
  };
  site: {
    url: string | null;
    name: string | null;
  };
  cors: {
    allowedOriginsCount: number;
    origins: string[];
  };
  api: {
    basePath: string;
  };
};

export type HealthResponse = {
  status: "ok" | "degraded";
  environment: string;
  timestamp: string;
  checks: HealthChecks;
};
