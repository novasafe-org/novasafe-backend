import type { HealthChecks, HealthDiagnosticItem, HealthEnvVariable, HealthResponse } from "@/types/api";
import {
  readGoogleCredentialsJson,
  readGoogleServiceAccountClientEmail,
} from "@/services/media/storage/config";

function envSet(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function maskId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "…";
  if (trimmed.length <= 10) return `…${trimmed.slice(-4)}`;
  return `…${trimmed.slice(-8)}`;
}

export function buildHealthEnvSnapshot(): HealthEnvVariable[] {
  const mediaProvider = (process.env.MEDIA_PROVIDER ?? "local").trim() || "local";
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const credentialsJsonPresent = envSet("GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentialsBase64Present = envSet("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentialsResolved = Boolean(readGoogleCredentialsJson());
  const clientEmail = readGoogleServiceAccountClientEmail();

  const vars: HealthEnvVariable[] = [
    { name: "ENVIRONMENT", set: envSet("ENVIRONMENT"), display: process.env.ENVIRONMENT?.trim() || undefined },
    { name: "JWT_SECRET", set: envSet("JWT_SECRET") },
    { name: "ADMIN_EMAIL", set: envSet("ADMIN_EMAIL") },
    { name: "ADMIN_PASSWORD", set: envSet("ADMIN_PASSWORD") },
    { name: "MONGODB_USERNAME", set: envSet("MONGODB_USERNAME") },
    { name: "MONGODB_PASSWORD", set: envSet("MONGODB_PASSWORD") },
    { name: "MONGODB_HOST", set: envSet("MONGODB_HOST"), display: process.env.MONGODB_HOST?.trim() },
    { name: "DATABASE_NAME", set: envSet("DATABASE_NAME"), display: process.env.DATABASE_NAME?.trim() },
    { name: "MEDIA_PROVIDER", set: true, display: mediaProvider },
    { name: "MEDIA_STORAGE_PATH", set: envSet("MEDIA_STORAGE_PATH"), display: process.env.MEDIA_STORAGE_PATH?.trim() },
    { name: "GOOGLE_DRIVE_FOLDER_ID", set: Boolean(folderId), display: folderId ? maskId(folderId) : undefined },
    { name: "GOOGLE_SERVICE_ACCOUNT_JSON", set: credentialsJsonPresent },
    { name: "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", set: credentialsBase64Present },
    { name: "GOOGLE_SERVICE_ACCOUNT_RESOLVED", set: credentialsResolved },
    {
      name: "GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL",
      set: Boolean(clientEmail),
      display: clientEmail,
    },
    { name: "SITE_URL", set: envSet("SITE_URL"), display: process.env.SITE_URL?.trim() },
    { name: "SITE_NAME", set: envSet("SITE_NAME"), display: process.env.SITE_NAME?.trim() },
    { name: "CORS_ALLOWED_ORIGINS", set: envSet("CORS_ALLOWED_ORIGINS") },
  ];

  return vars;
}

function remediation(...steps: string[]): string[] {
  return steps.filter(Boolean);
}

export function buildHealthDiagnostics(checks: HealthChecks): HealthDiagnosticItem[] {
  const items: HealthDiagnosticItem[] = [];
  const clientEmail = readGoogleServiceAccountClientEmail();

  if (!envSet("ENVIRONMENT")) {
    items.push({
      severity: "info",
      code: "ENVIRONMENT_DEFAULT",
      message: "ENVIRONMENT is unset; health reports development.",
      remediation: remediation("Set ENVIRONMENT=production in admin-api Lambda env (S3 .env) if this is production."),
    });
  }

  const { mongodb } = checks;
  if (!mongodb.configured) {
    items.push({
      severity: "error",
      code: "MONGODB_NOT_CONFIGURED",
      message: mongodb.error ?? "MongoDB environment variables are incomplete.",
      remediation: remediation(
        "Set MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_HOST, and DATABASE_NAME in admin-api env.",
        "Redeploy after updating the S3 admin-api/.env bundle.",
      ),
    });
  } else if (!mongodb.connected) {
    items.push({
      severity: "error",
      code: "MONGODB_DISCONNECTED",
      message: mongodb.error ?? "MongoDB ping failed.",
      remediation: remediation(
        "Verify Atlas IP allowlist / network access includes Lambda egress.",
        "Confirm username, password, host, and database name match the cluster.",
      ),
    });
  }

  const { auth } = checks;
  if (!auth.jwtConfigured) {
    items.push({
      severity: "error",
      code: "JWT_SECRET_MISSING",
      message: "JWT_SECRET is not set.",
      remediation: remediation("Set JWT_SECRET in admin-api env for dashboard login and signed tokens."),
    });
  }
  if (!auth.adminLoginConfigured) {
    items.push({
      severity: "warning",
      code: "ADMIN_LOGIN_NOT_CONFIGURED",
      message: "ADMIN_EMAIL and/or ADMIN_PASSWORD are missing.",
      remediation: remediation(
        "Set both ADMIN_EMAIL and ADMIN_PASSWORD for blog dashboard login.",
        "Blog automation with API tokens (nsa_live_*) does not require admin password env.",
      ),
    });
  }

  const { media } = checks;
  if (media.provider === "google_drive") {
    if (!envSet("GOOGLE_DRIVE_FOLDER_ID")) {
      items.push({
        severity: "error",
        code: "GOOGLE_DRIVE_FOLDER_ID_MISSING",
        message: "GOOGLE_DRIVE_FOLDER_ID is not set.",
        remediation: remediation(
          "Create a folder in Google Drive and copy the id from https://drive.google.com/drive/folders/FOLDER_ID",
        ),
      });
    }
    if (!readGoogleCredentialsJson()) {
      items.push({
        severity: "error",
        code: "GOOGLE_SERVICE_ACCOUNT_MISSING",
        message: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set.",
        remediation: remediation(
          "Create a GCP service account, enable Drive API, download JSON key.",
          "Store the JSON in env (one line) or base64 variant — never commit the key.",
        ),
      });
    } else if (!clientEmail) {
      items.push({
        severity: "error",
        code: "GOOGLE_SERVICE_ACCOUNT_INVALID",
        message: "Service account JSON is present but client_email could not be parsed.",
        remediation: remediation("Paste the full service account key JSON from GCP (valid JSON with client_email)."),
      });
    }

    if (media.storageOk === false) {
      items.push({
        severity: "error",
        code: "GOOGLE_DRIVE_STORAGE_UNHEALTHY",
        message: media.storageDetail ?? "Google Drive storage health check failed.",
        remediation: remediation(
          "Enable Google Drive API on the GCP project for this service account.",
          clientEmail
            ? `In Google Drive, share the upload folder with ${clientEmail} as Editor (not Viewer).`
            : "Share the upload folder with the service account client_email as Editor.",
          "Use GOOGLE_DRIVE_FOLDER_ID from the folder URL (.../folders/FOLDER_ID), not a file id.",
          "After env changes, redeploy admin-api and call GET /api/v1/health/detailed again.",
          "Test with POST /api/v1/media/upload if health still disagrees with reality.",
        ),
      });
    }
  } else if (media.storageOk === false) {
    items.push({
      severity: "error",
      code: "MEDIA_STORAGE_UNHEALTHY",
      message: media.storageDetail ?? "Local media storage health check failed.",
      remediation: remediation(
        `Ensure MEDIA_STORAGE_PATH (${media.storagePath ?? "./uploads"}) exists and is writable.`,
        "On Lambda, use a writable path such as /tmp/uploads.",
      ),
    });
  }

  if (!checks.site.url) {
    items.push({
      severity: "info",
      code: "SITE_URL_MISSING",
      message: "SITE_URL is not set.",
      remediation: remediation("Set SITE_URL for correct SEO feed and canonical links."),
    });
  }

  if (checks.cors.allowedOriginsCount === 0) {
    items.push({
      severity: "info",
      code: "CORS_ALLOWED_ORIGINS_EMPTY",
      message: "CORS_ALLOWED_ORIGINS is empty.",
      remediation: remediation(
        "Set CORS_ALLOWED_ORIGINS if browser clients call the blog API directly.",
        "Server-side automation (n8n) does not need CORS.",
      ),
    });
  }

  return items;
}

export function buildStatusReasons(checks: HealthChecks): string[] {
  const reasons: string[] = [];
  if (!checks.mongodb.connected) reasons.push("mongodb_not_connected");
  if (!checks.auth.jwtConfigured) reasons.push("jwt_secret_missing");
  if (!checks.auth.adminLoginConfigured) reasons.push("admin_login_not_configured");
  if (checks.media.storageOk === false) reasons.push("media_storage_unhealthy");
  if (checks.media.storageOk === undefined && checks.media.provider === "google_drive") {
    reasons.push("media_storage_unknown");
  }
  return reasons;
}

export function attachHealthDiagnostics(
  checks: HealthChecks,
  base: Omit<HealthResponse, "diagnostics" | "env" | "statusReasons">,
): HealthResponse {
  const env = buildHealthEnvSnapshot();
  const diagnostics = buildHealthDiagnostics(checks);
  const statusReasons = buildStatusReasons(checks);

  return {
    ...base,
    env,
    diagnostics,
    statusReasons,
  };
}
