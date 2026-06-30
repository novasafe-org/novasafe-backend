/** Paths used by Docker healthchecks — skip 2xx access logs to reduce noise. */

const HEALTH_PROBE_PATHS = new Set(['/health', '/api/v1/health']);

export const isHealthProbePath = (path: string): boolean => {
  const normalized = path.split('?')[0] || path;
  return HEALTH_PROBE_PATHS.has(normalized) || normalized.endsWith('/health');
};

export const shouldLogHealthProbeAccess = (path: string, statusCode?: number): boolean => {
  if (!isHealthProbePath(path)) return true;
  const status = statusCode ?? 0;
  return status < 200 || status >= 300;
};
