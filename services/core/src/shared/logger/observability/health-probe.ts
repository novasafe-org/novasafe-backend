/** Paths used by Docker/load-balancer healthchecks — skip 2xx access logs to reduce noise. */

const HEALTH_PROBE_PATHS = new Set(['/health', '/mobile/health', '/api/v1/health']);

export const isHealthProbePath = (path: string): boolean => {
  const normalized = path.split('?')[0] || path;
  if (HEALTH_PROBE_PATHS.has(normalized)) return true;
  // Module-level probes: /api/v1/users/health, etc.
  return normalized.endsWith('/health');
};

/** Log access unless this is a successful health probe (Docker curls every 30s). */
export const shouldLogHealthProbeAccess = (path: string, statusCode?: number): boolean => {
  if (!isHealthProbePath(path)) return true;
  const status = statusCode ?? 0;
  return status < 200 || status >= 300;
};
