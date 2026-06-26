#!/usr/bin/env node
/**
 * NovaSafe — generate version.json build metadata.
 * Never edit version.json manually; this script is the single writer.
 *
 * Usage:
 *   node scripts/versioning/generate-build-metadata.mjs
 *   node scripts/versioning/generate-build-metadata.mjs --package services/core/package.json --out public
 *
 * Environment (CI sets these automatically):
 *   APP_VERSION, BUILD_NUMBER, GIT_COMMIT, GITHUB_SHA, GIT_BRANCH, GITHUB_REF_NAME,
 *   DEPLOY_ENV, NODE_ENV, REPOSITORY, GITHUB_REPOSITORY, REPO_ROOT
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { packageJson: "package.json", out: "public", repoRoot: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--package" && argv[i + 1]) opts.packageJson = argv[++i];
    else if (arg === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (arg === "--repo-root" && argv[i + 1]) opts.repoRoot = argv[++i];
  }
  return opts;
}

function readPackageVersion(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function buildNumber(now = new Date()) {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}${mo}${d}.${h}${mi}`;
}

const opts = parseArgs(process.argv);
const repoRoot = path.resolve(
  process.env.REPO_ROOT || opts.repoRoot || path.join(__dirname, "..", ".."),
);
const pkgPath = path.resolve(repoRoot, opts.packageJson);
const version = process.env.APP_VERSION || readPackageVersion(pkgPath);
const now = new Date();
const metadata = {
  version,
  build: process.env.BUILD_NUMBER || buildNumber(now),
  commit: (process.env.GIT_COMMIT || process.env.GITHUB_SHA || "unknown").slice(0, 7),
  branch: process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || "unknown",
  environment: process.env.DEPLOY_ENV || process.env.NODE_ENV || "production",
  releasedAt: process.env.RELEASED_AT || now.toISOString(),
  repository: process.env.REPOSITORY || process.env.GITHUB_REPOSITORY || path.basename(repoRoot),
};

const outDir = path.resolve(repoRoot, opts.out);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "version.json");
fs.writeFileSync(outFile, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`[novasafe-version] ${outFile}`);
console.log(JSON.stringify(metadata));
