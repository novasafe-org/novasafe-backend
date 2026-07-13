#!/usr/bin/env node
/**
 * Package a NovaSafe backend service for AWS Lambda.
 *
 * Builds the service, bundles the Lambda handler with esbuild (inlines all JS deps),
 * ships only the bundled handler + version.json + .env. No node_modules in the zip.
 *
 * Usage:
 *   node scripts/package-lambda.mjs --service core --env-file /path/to/.env
 *   node scripts/package-lambda.mjs --service admin-app --env-file /path/to/.env
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(join(repoRoot, 'package.json'));

const SERVICES = {
  core: {
    filter: 'core-service',
    serviceDir: 'services/core',
    label: 'mobile-api',
    handler: 'dist/runtimes/lambda.handler',
  },
  'admin-app': {
    filter: 'admin-app-service',
    serviceDir: 'services/admin-app',
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

const resolveEsbuildBin = () => {
  try {
    const pkgJson = requireFromRoot.resolve('esbuild/package.json');
    return join(dirname(pkgJson), 'bin/esbuild');
  } catch {
    console.error('::error::esbuild is required for Lambda packaging (root devDependency).');
    process.exit(1);
  }
};

const assertLambdaPackage = (packageDir) => {
  const handlerPath = join(packageDir, 'dist/runtimes/lambda.js');
  const required = [
    ['Lambda handler', handlerPath],
    ['env file', join(packageDir, '.env')],
    ['version metadata', join(packageDir, 'dist/version.json')],
  ];

  for (const [label, filePath] of required) {
    if (!existsSync(filePath)) {
      console.error(`::error::Lambda package missing ${label}: ${filePath}`);
      process.exit(1);
    }
  }

  if (existsSync(join(packageDir, 'node_modules'))) {
    console.error('::error::Lambda package must not include node_modules (use esbuild bundle only).');
    process.exit(1);
  }

  const handlerSize = statSync(handlerPath).size;
  if (handlerSize < 500_000) {
    console.error(
      `::error::Lambda handler looks too small (${handlerSize} bytes). esbuild bundle may have failed.`,
    );
    process.exit(1);
  }

  console.log(`[lambda-package] handler bundle size: ${(handlerSize / 1024 / 1024).toFixed(2)} MB`);
};

const verifyRuntimeModules = (packageDir) => {
  const script = [
    "process.env.LOG_ENABLE_FILE = process.env.LOG_ENABLE_FILE || 'false'",
    "process.env.LOG_ENABLE_CONSOLE = process.env.LOG_ENABLE_CONSOLE || 'true'",
    "process.env.LOG_DIR = process.env.LOG_DIR || '/tmp/logs'",
    "require('./dist/runtimes/lambda.js')",
    "console.log('[lambda-package] runtime module resolution OK')",
  ].join('; ');

  run(`node -e ${JSON.stringify(script)}`, { cwd: packageDir });
};

const assertZipHasNoNodeModules = (zipPath) => {
  const listing = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
  if (listing.includes('node_modules/')) {
    console.error('::error::Lambda zip must not contain node_modules/. Redeploy with esbuild packaging.');
    process.exit(1);
  }
};

const bundleLambdaHandler = (entryPath, outputPath) => {
  const esbuildBin = resolveEsbuildBin();
  mkdirSync(dirname(outputPath), { recursive: true });

  run(
    `"${esbuildBin}" "${entryPath}" --bundle --platform=node --target=node20 --format=cjs --outfile="${outputPath}"`,
    { cwd: repoRoot },
  );
};

const { service, envFile, output } = parseArgs();
const config = SERVICES[service];
const serviceRoot = join(repoRoot, config.serviceDir);

readFileSync(envFile, 'utf8');

const stageDir = mkdtempSync(join(tmpdir(), `novasafe-lambda-${config.label}-`));
const packageDir = join(stageDir, 'package');
const handlerEntry = join(serviceRoot, 'dist/runtimes/lambda.js');
const handlerOutput = join(packageDir, 'dist/runtimes/lambda.js');
const versionJson = join(serviceRoot, 'dist/version.json');

try {
  run('pnpm --filter @novasafe/feature-flags run build', { cwd: repoRoot });
  run(`pnpm --filter ${config.filter} run build`, { cwd: repoRoot });
  run(`pnpm --filter ${config.filter} run build:lambda`, { cwd: repoRoot });

  if (!existsSync(handlerEntry)) {
    console.error(`::error::Lambda handler not built: ${handlerEntry}`);
    process.exit(1);
  }

  if (!existsSync(versionJson)) {
    console.error(`::error::version.json not built: ${versionJson}`);
    process.exit(1);
  }

  mkdirSync(join(packageDir, 'dist/runtimes'), { recursive: true });
  cpSync(versionJson, join(packageDir, 'dist/version.json'));

  bundleLambdaHandler(handlerEntry, handlerOutput);

  writeFileSync(join(packageDir, '.env'), readFileSync(envFile, 'utf8'), 'utf8');
  console.log(`[lambda-package] wrote ${join(packageDir, '.env')}`);

  assertLambdaPackage(packageDir);
  verifyRuntimeModules(packageDir);

  mkdirSync(resolve(output, '..'), { recursive: true });
  rmSync(output, { force: true });
  run(`cd "${packageDir}" && zip -qr "${output}" .`);
  assertZipHasNoNodeModules(output);

  console.log(`[lambda-package] ${config.label} → ${output}`);
  console.log(`[lambda-package] handler: ${config.handler}`);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
