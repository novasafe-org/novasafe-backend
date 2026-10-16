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
    provider: string;
    storagePath?: string;
    maxBytes: number;
    storageOk?: boolean;
    storageDetail?: string;
    config?: {
      credentialsConfigured: boolean;
      folderIdPreview?: string;
      serviceAccountEmail?: string;
      cacheEnabled?: boolean;
    };
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

export type HealthEnvVariable = {
  name: string;
  set: boolean;
  /** Non-secret value safe to expose in health output */
  display?: string;
};

export type HealthDiagnosticItem = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  remediation?: string[];
};

export type HealthResponse = {
  status: "ok" | "degraded";
  environment: string;
  timestamp: string;
  checks: HealthChecks;
  /** Which required env vars are present (never includes secrets). */
  env: HealthEnvVariable[];
  /** Actionable issues and setup hints derived from checks + env. */
  diagnostics: HealthDiagnosticItem[];
  /** Short machine-readable summary of why status is degraded. */
  statusReasons: string[];
};
