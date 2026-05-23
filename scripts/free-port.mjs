#!/usr/bin/env node
/**
 * Frees a TCP port by SIGTERM then SIGKILL on listeners (macOS/Linux).
 * Used before `dev` to clear orphaned tsx/node processes from prior sessions.
 *
 * Usage: node scripts/free-port.mjs 5100
 */
import { execSync } from 'child_process';

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) {
  console.error('Usage: node scripts/free-port.mjs <port>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listPids = () => {
  try {
    const out = execSync(`lsof -ti :${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return [];
    return [...new Set(out.split('\n').filter(Boolean))];
  } catch {
    return [];
  }
};

const killPids = (pids, signal) => {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
    } catch {
      // already gone
    }
  }
};

const main = async () => {
  let pids = listPids();
  if (pids.length === 0) {
    process.exit(0);
  }

  console.log(`[free-port] Port ${port} in use by PID(s): ${pids.join(', ')} — stopping…`);
  killPids(pids, 'SIGTERM');
  await sleep(400);
  pids = listPids();
  if (pids.length > 0) {
    killPids(pids, 'SIGKILL');
    await sleep(200);
  }

  pids = listPids();
  if (pids.length > 0) {
    console.error(`[free-port] Could not free port ${port}. Still held by: ${pids.join(', ')}`);
    process.exit(1);
  }

  console.log(`[free-port] Port ${port} is free.`);
};

main();
