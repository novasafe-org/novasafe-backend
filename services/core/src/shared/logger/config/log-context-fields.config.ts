/**
 * All fields that can be attached to logs from request context + call-site meta.
 * Configure via LOG_CONTEXT_FIELDS (comma-separated) in .env.
 */
export const LOG_CONTEXT_FIELD_KEYS = [
  'requestId',
  'traceId',
  'correlationId',
  'declaredSource',
  'verifiedSource',
  'source',
  'sourceLabel',
  'platform',
  'legacySource',
  'trustLevel',
  'verificationStatus',
  'riskScore',
  'userId',
  'sessionId',
  'deviceId',
  'tier',
  'isPro',
  'isActive',
  'expiresAt',
  'canUseCloudSync',
  'canUseMultiDevice',
  'responseMessage',
  'responseCode',
  'appVersion',
  'buildVersion',
  'apiVersion',
  'tenantId',
  'region',
  'context',
] as const;

export type LogContextFieldKey = (typeof LOG_CONTEXT_FIELD_KEYS)[number];

/** HTTP access log fields (LOG_HTTP_FIELDS). */
export const LOG_HTTP_FIELD_KEYS = [
  'requestId',
  'correlationId',
  'method',
  'url',
  'path',
  'statusCode',
  'durationMs',
  'ip',
  'userAgent',
  'contentLength',
  'declaredSource',
  'source',
  'platform',
  'userId',
  'context',
  'responseMessage',
  'responseCode',
] as const;

export type LogHttpFieldKey = (typeof LOG_HTTP_FIELD_KEYS)[number];

const DEFAULT_CONTEXT_FIELDS: LogContextFieldKey[] = [
  'requestId',
  'traceId',
  'correlationId',
  'source',
  'sourceLabel',
  'platform',
  'legacySource',
  'userId',
];

const DEFAULT_HTTP_FIELDS: LogHttpFieldKey[] = [
  'requestId',
  'correlationId',
  'method',
  'url',
  'path',
  'statusCode',
  'durationMs',
  'ip',
  'userId',
  'platform',
  'source',
];

const parseFieldList = <T extends string>(
  envValue: string | undefined,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] => {
  const allowedSet = new Set<string>(allowed);
  const raw = envValue?.trim()
    ? envValue.split(',').map((s) => s.trim()).filter(Boolean)
    : [...fallback];

  const picked: T[] = [];
  for (const key of raw) {
    if (allowedSet.has(key)) {
      picked.push(key as T);
    }
  }
  return picked.length > 0 ? picked : [...fallback];
};

export const resolveLogContextFields = (): LogContextFieldKey[] =>
  parseFieldList(
    process.env.LOG_CONTEXT_FIELDS,
    LOG_CONTEXT_FIELD_KEYS,
    DEFAULT_CONTEXT_FIELDS,
  );

export const resolveLogHttpFields = (): LogHttpFieldKey[] =>
  parseFieldList(process.env.LOG_HTTP_FIELDS, LOG_HTTP_FIELD_KEYS, DEFAULT_HTTP_FIELDS);

/** Pick only configured keys; omit undefined / null / empty string. */
export const pickLogFields = <T extends Record<string, unknown>>(
  source: T,
  keys: readonly string[],
): Partial<T> => {
  const out: Partial<T> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
};

