export type AppConfig = {
  ENVIRONMENT: string;
  API_BASE_PATH: string;
  CORS_ALLOWED_ORIGINS: string;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_ACCESS_TTL_SECONDS: string;
  MONGODB_USERNAME: string;
  MONGODB_PASSWORD: string;
  MONGODB_HOST: string;
  MONGODB_OPTIONS: string;
  DATABASE_NAME: string;
  SITE_URL: string;
  SITE_NAME: string;
  SITE_DESCRIPTION: string;
  MEDIA_MAX_BYTES: string;
  MEDIA_ALLOWED_MIME_TYPES: string;
  MEDIA_STORAGE_PATH: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
};

export function buildMongoUri(config: Pick<
  AppConfig,
  "MONGODB_USERNAME" | "MONGODB_PASSWORD" | "MONGODB_HOST" | "MONGODB_OPTIONS"
>): string {
  const username = encodeURIComponent(config.MONGODB_USERNAME);
  const password = encodeURIComponent(config.MONGODB_PASSWORD);
  const host = config.MONGODB_HOST.trim()
    .replace(/^mongodb(\+srv)?:\/\//, "")
    .replace(/\/$/, "");
  const options = config.MONGODB_OPTIONS.trim();
  const query = options.startsWith("?") ? options : `?${options}`;
  return `mongodb+srv://${username}:${password}@${host}/${query}`;
}

export function getConfig(): AppConfig {
  const required = (key: string, fallback?: string): string => {
    const value = process.env[key] ?? fallback;
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  };

  return {
    ENVIRONMENT: process.env.ENVIRONMENT ?? "development",
    API_BASE_PATH: process.env.API_BASE_PATH ?? "/api",
    CORS_ALLOWED_ORIGINS:
      process.env.CORS_ALLOWED_ORIGINS ??
      "http://localhost:8080,http://localhost:5173",
    JWT_SECRET: required("JWT_SECRET"),
    JWT_ISSUER: process.env.JWT_ISSUER ?? "novasafe-blog-api",
    JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? "novasafe-blog-admin",
    JWT_ACCESS_TTL_SECONDS: process.env.JWT_ACCESS_TTL_SECONDS ?? "3600",
    MONGODB_USERNAME: required("MONGODB_USERNAME"),
    MONGODB_PASSWORD: required("MONGODB_PASSWORD"),
    MONGODB_HOST: required("MONGODB_HOST"),
    MONGODB_OPTIONS: process.env.MONGODB_OPTIONS ?? "retryWrites=true&w=majority",
    DATABASE_NAME: process.env.DATABASE_NAME ?? "blog_cms",
    SITE_URL: process.env.SITE_URL ?? "http://localhost:8080",
    SITE_NAME: process.env.SITE_NAME ?? "NovaSafe Blog",
    SITE_DESCRIPTION:
      process.env.SITE_DESCRIPTION ??
      "Security insights and updates from the NovaSafe team.",
    MEDIA_MAX_BYTES: process.env.MEDIA_MAX_BYTES ?? "5242880",
    MEDIA_ALLOWED_MIME_TYPES:
      process.env.MEDIA_ALLOWED_MIME_TYPES ??
      "image/jpeg,image/png,image/webp,image/gif,image/avif",
    MEDIA_STORAGE_PATH: process.env.MEDIA_STORAGE_PATH ?? "./uploads",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };
}
