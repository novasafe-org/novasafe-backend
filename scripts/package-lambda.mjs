#!/usr/bin/env node
/**
 * Package a NovaSafe backend service for AWS Lambda.
 *
 * Produces a zip with production node_modules, compiled dist/, and a `.env` file
 * (same dotenv format as VPS Docker). loadEnv.ts reads `.env` at cold start.
 *
 * Usage:
 *   node scripts/package-lambda.mjs --service core --env-file /path/to/.env
 *   node scripts/package-lambda.mjs --service admin-app --env-file /path/to/.env
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SERVICES = {
  core: {
    filter: 'core-service',
    label: 'mobile-api',
    handler: 'dist/runtimes/lambda.handler',
  },
  'admin-app': {
    filter: 'admin-app-service',
    label: 'admin-api',
    handler: 'dist/runtimes/lambda.handler',
  },
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let service;
  let envFile;
  let output = 'dist/lambda.zip';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--service') {
      service = args[++i];
    } else if (arg === '--env-file') {
      envFile = args[++i];
    } else if (arg === '--output') {
      output = args[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!service || !SERVICES[service]) {
    console.error('Missing or invalid --service (core | admin-app)');
    process.exit(1);
  }

  if (!envFile) {
    console.error('Missing --env-file (path to merged .env for Lambda)');
    process.exit(1);
  }

  return { service, envFile: resolve(envFile), output: resolve(output) };
};

const run = (command, options = {}) => {
  console.log(`[lambda-package] $ ${command}`);
  execSync(command, { stdio: 'inherit', ...options });
};

const assertLambdaPackage = (deployDir) => {
  const required = [
    ['Lambda handler', join(deployDir, 'dist/runtimes/lambda.js')],
    ['serverless-express', join(deployDir, 'node_modules/@codegenie/serverless-express/package.json')],
    ['env file', join(deployDir, '.env')],
  ];

  for (const [label, filePath] of required) {
    if (!existsSync(filePath)) {
      console.error(`::error::Lambda package missing ${label}: ${filePath}`);
      process.exit(1);
    }
  }

  console.log('[lambda-package] package validation passed');
};

const { service, envFile, output } = parseArgs();
const config = SERVICES[service];

readFileSync(envFile, 'utf8');

const stageDir = mkdtempSync(join(tmpdir(), `novasafe-lambda-${config.label}-`));
const deployDir = join(stageDir, 'package');

try {
  run('pnpm --filter @novasafe/feature-flags run build', { cwd: repoRoot });
  run(`pnpm --filter ${config.filter} run build`, { cwd: repoRoot });
  run(`pnpm --filter ${config.filter} run build:lambda`, { cwd: repoRoot });

  mkdirSync(deployDir, { recursive: true });
  run(`pnpm --filter ${config.filter} deploy --prod --legacy "${deployDir}"`, {
    cwd: repoRoot,
    env: { ...process.env, HUSKY: '0' },
  });

  writeFileSync(join(deployDir, '.env'), readFileSync(envFile, 'utf8'), 'utf8');
  console.log(`[lambda-package] wrote ${join(deployDir, '.env')}`);

  assertLambdaPackage(deployDir);

  mkdirSync(resolve(output, '..'), { recursive: true });
  rmSync(output, { force: true });
  run(`cd "${deployDir}" && zip -qr "${output}" . -x "*.map"`);

  console.log(`[lambda-package] ${config.label} → ${output}`);
  console.log(`[lambda-package] handler: ${config.handler}`);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
