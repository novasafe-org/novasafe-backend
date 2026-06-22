import type { AppConfig } from "@/types/config";
import type { HealthChecks, HealthResponse } from "@/types/api";
import { isMongoConfigured, getMongoDatabase } from "@/lib/mongodb";

function envFlag(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function safeConfigSlice(): Partial<AppConfig> {
  return {
    ENVIRONMENT: process.env.ENVIRONMENT ?? "development",
    API_BASE_PATH: process.env.API_BASE_PATH ?? "/api",
    DATABASE_NAME: process.env.DATABASE_NAME ?? "blog_cms",
    MONGODB_HOST: process.env.MONGODB_HOST,
    SITE_URL: process.env.SITE_URL,
    MEDIA_STORAGE_PATH: process.env.MEDIA_STORAGE_PATH ?? "./uploads",
  };
}

async function checkMongo(): Promise<HealthChecks["mongodb"]> {
  const host = process.env.MONGODB_HOST?.trim() ?? null;
  const database = process.env.DATABASE_NAME?.trim() ?? "blog_cms";
  const configured = isMongoConfigured();

  if (!configured) {
    return {
      configured: false,
      connected: false,
      host,
      database,
      error: "Missing MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_HOST, or DATABASE_NAME",
    };
  }

  try {
    const db = await getMongoDatabase();
    await db.command({ ping: 1 });
    return { configured: true, connected: true, host, database };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      host,
      database,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function buildHealthResponse(): Promise<HealthResponse> {
  const slice = safeConfigSlice();
  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const mongodb = await checkMongo();

  const checks: HealthChecks = {
    mongodb,
    auth: {
      jwtConfigured: envFlag("JWT_SECRET"),
      adminLoginConfigured: envFlag("ADMIN_EMAIL") && envFlag("ADMIN_PASSWORD"),
      issuer: process.env.JWT_ISSUER ?? "novasafe-blog-api",
      audience: process.env.JWT_AUDIENCE ?? "novasafe-blog-admin",
    },
    media: {
      provider: "local",
      storagePath: slice.MEDIA_STORAGE_PATH ?? "./uploads",
      maxBytes: Number.parseInt(process.env.MEDIA_MAX_BYTES ?? "5242880", 10),
    },
    site: {
      url: slice.SITE_URL ?? null,
      name: process.env.SITE_NAME ?? null,
    },
    cors: {
      allowedOriginsCount: corsOrigins.length,
      origins: corsOrigins,
    },
    api: {
      basePath: slice.API_BASE_PATH ?? "/api",
    },
  };

  const allCriticalOk =
    mongodb.connected && checks.auth.jwtConfigured && checks.auth.adminLoginConfigured;

  return {
    status: allCriticalOk ? "ok" : "degraded",
    environment: slice.ENVIRONMENT ?? "development",
    timestamp: new Date().toISOString(),
    checks,
  };
}

export async function isReady(): Promise<boolean> {
  const health = await buildHealthResponse();
  return health.checks.mongodb.connected;
}
