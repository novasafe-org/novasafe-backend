#!/usr/bin/env node
/**
 * Frees a TCP port by terminating listeners (macOS/Linux/Windows).
 * Used before `dev` to clear orphaned tsx/node processes from prior sessions.
 *
 * Usage:
 *   node scripts/free-port.mjs 3125
 *   node scripts/free-port.mjs CORE_PORT 3125
 */
import { execSync } from 'child_process';

const resolvePort = () => {
  const [a, b] = process.argv.slice(2);

  if (a && /^\d+$/.test(a)) return a;

  if (a && /^\$\{([^:}]+)(?::-(\d+))?\}$/.test(a)) {
    const [, envKey, fallback] = a.match(/^\$\{([^:}]+)(?::-(\d+))?\}$/);
    return process.env[envKey] || fallback;
  }

  if (a && /^[A-Z][A-Z0-9_]*$/.test(a)) {
    return process.env[a] || b;
  }

  return null;
};

const port = resolvePort();
if (!port || !/^\d+$/.test(port)) {
  console.error('Usage: node scripts/free-port.mjs <port>');
  console.error('       node scripts/free-port.mjs <ENV_VAR> <defaultPort>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isWin = process.platform === 'win32';

const listPidsUnix = () => {
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

const listPidsWin = () => {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const pids = new Set();
    const portSuffix = `:${port}`;

    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;
      const localAddr = cols[1];
      if (!localAddr.endsWith(portSuffix) && !localAddr.includes(`]:${port}`)) {
        continue;
      }
      const pid = cols[cols.length - 1];
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }

    return [...pids];
  } catch {
    return [];
  }
};

const listPids = () => (isWin ? listPidsWin() : listPidsUnix());

const killPids = (pids, signal) => {
  for (const pid of pids) {
    try {
      if (isWin) {
        const force = signal === 'SIGKILL' ? ' /F' : '';
        execSync(`taskkill /PID ${pid}${force} /T`, { stdio: 'ignore' });
      } else {
        process.kill(Number(pid), signal);
      }
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
