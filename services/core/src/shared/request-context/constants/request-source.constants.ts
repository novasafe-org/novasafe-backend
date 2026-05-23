/** Canonical HTTP headers for client identification (lowercase keys in Node). */
export const REQUEST_CONTEXT_HEADERS = {
  CLIENT_SOURCE: 'x-client-source',
  CLIENT_PLATFORM: 'x-client-platform',
  CLIENT_VERSION: 'x-client-version',
  BUILD_VERSION: 'x-build-version',
  DEVICE_ID: 'x-device-id',
  REQUEST_ID: 'x-request-id',
  SESSION_ID: 'x-session-id',
  TRACE_ID: 'x-trace-id',
  API_VERSION: 'x-api-version',
  CORRELATION_ID: 'x-correlation-id',
  TENANT: 'x-tenant',
  REGION: 'x-client-region',
  /** Legacy mobile_vault / vault clients */
  LEGACY_SOURCE: 'x-source',
  /** Trust layer — see shared/trust/constants */
  CLIENT_ID: 'x-client-id',
} as const;

export const REQUEST_CONTEXT_LIMITS = {
  MAX_HEADER_VALUE_LENGTH: 256,
  MAX_DEVICE_ID_LENGTH: 128,
  MAX_USER_AGENT_LENGTH: 512,
} as const;
