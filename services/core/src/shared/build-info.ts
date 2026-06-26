import fs from "node:fs";
import path from "node:path";

export type BuildMetadata = {
  version: string;
  build: string;
  commit: string;
  branch: string;
  environment: string;
  releasedAt: string;
  repository: string;
};

function readVersionFile(): Partial<BuildMetadata> | null {
  const candidates = [
    path.join(__dirname, "version.json"),
    path.join(process.cwd(), "version.json"),
    path.join(__dirname, "..", "generated", "version.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf8")) as Partial<BuildMetadata>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function envOr<T extends keyof BuildMetadata>(
  key: T,
  fromFile: Partial<BuildMetadata> | null,
  fallback: string,
): string {
  const envMap: Record<keyof BuildMetadata, string | undefined> = {
    version: process.env.APP_VERSION,
    build: process.env.BUILD_NUMBER,
    commit: process.env.GIT_COMMIT,
    branch: process.env.GIT_BRANCH,
    environment: process.env.DEPLOY_ENV || process.env.NODE_ENV,
    releasedAt: process.env.RELEASED_AT,
    repository: process.env.REPOSITORY,
  };
  return envMap[key] || (fromFile?.[key] as string | undefined) || fallback;
}

let cached: BuildMetadata | null = null;

export function getBuildInfo(serviceRepository: string): BuildMetadata {
  if (cached) return cached;

  const fromFile = readVersionFile();
  cached = {
    version: envOr("version", fromFile, "1.0.0"),
    build: envOr("build", fromFile, "local"),
    commit: envOr("commit", fromFile, "unknown").slice(0, 7),
    branch: envOr("branch", fromFile, "unknown"),
    environment: envOr("environment", fromFile, "development"),
    releasedAt: envOr("releasedAt", fromFile, new Date().toISOString()),
    repository: envOr("repository", fromFile, serviceRepository),
  };
  return cached;
}

export function getVersionPayload(serviceRepository: string) {
  const info = getBuildInfo(serviceRepository);
  return {
    version: info.version,
    build: info.build,
    commit: info.commit,
    environment: info.environment,
    releasedAt: info.releasedAt,
    repository: info.repository,
  };
}
