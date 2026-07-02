#!/usr/bin/env node
/**
 * Portable test runner for node:test + tsx (Linux CI does not expand quoted globs).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function collectTests(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(full));
      continue;
    }
    if (entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const serviceRoot = resolve(process.argv[2] ?? '.');
const catalogRoot = resolve(serviceRoot, '../../common/feature-flags');
const files = [
  ...collectTests(join(serviceRoot, 'src')),
  ...collectTests(catalogRoot),
];

if (files.length === 0) {
  console.error(`[run-node-tests] No *.test.ts files found under ${serviceRoot}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: serviceRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
