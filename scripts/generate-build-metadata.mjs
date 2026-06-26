#!/usr/bin/env node
/** Wrapper — delegates to shared NovaSafe versioning script when present. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const shared = path.join(repoRoot, "scripts", "versioning", "generate-build-metadata.mjs");
const local = path.join(__dirname, "versioning", "generate-build-metadata.mjs");
const script = fs.existsSync(shared) ? shared : local;

const args = process.argv.slice(2);
const child = spawnSync(process.execPath, [script, ...args], {
  stdio: "inherit",
  env: { ...process.env, REPO_ROOT: repoRoot },
});
process.exit(child.status ?? 1);
