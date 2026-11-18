import { StorageError, StorageErrorCodes, type StorageErrorCode } from '../storage/storage.errors';

/**
 * NAS-Control error contract (from envelope.go):
 *   HTTP status + JSON { success: false, message: string, data: null }
 *
 * Map status/message → generic StorageError. Never forward raw NAS messages to clients.
 */

export type NasEnvelope = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

type MapRule = {
  status?: number;
  messageIncludes?: string | RegExp;
  code: StorageErrorCode;
  httpStatus: number;
  userMessage: string;
};

const RULES: MapRule[] = [
  {
    status: 401,
    messageIncludes: /invalid credentials/i,
    code: StorageErrorCodes.STORAGE_AUTH_FAILED,
    httpStatus: 503,
    userMessage: 'Document storage authentication failed. Please try again later.',
  },
  {
    status: 401,
    messageIncludes: /x-agent-token/i,
    code: StorageErrorCodes.STORAGE_MISCONFIGURED,
    httpStatus: 503,
    userMessage: 'Document storage is misconfigured. Please contact support.',
  },
  {
    status: 401,
    code: StorageErrorCodes.STORAGE_AUTH_FAILED,
    httpStatus: 503,
    userMessage: 'Document storage session expired. Please try again.',
  },
  {
    status: 403,
    code: StorageErrorCodes.STORAGE_FORBIDDEN,
    httpStatus: 403,
    userMessage: 'You do not have permission to perform this document action.',
  },
  {
    status: 404,
    messageIncludes: /file not found|file missing|not found/i,
    code: StorageErrorCodes.STORAGE_OBJECT_NOT_FOUND,
    httpStatus: 404,
    userMessage: 'Document not found.',
  },
  {
    status: 400,
    messageIncludes: /multipart|missing file|invalid path/i,
    code: StorageErrorCodes.DOCUMENT_INVALID_UPLOAD,
    httpStatus: 400,
    userMessage: 'Invalid file upload. Check the file and try again.',
  },
  {
    status: 413,
    code: StorageErrorCodes.DOCUMENT_TOO_LARGE,
    httpStatus: 413,
    userMessage: 'File is too large to upload.',
  },
  {
    status: 409,
    code: StorageErrorCodes.DOCUMENT_CONFLICT,
    httpStatus: 409,
    userMessage: 'Document conflict. Please refresh and try again.',
  },
  {
    status: 503,
    code: StorageErrorCodes.STORAGE_UNAVAILABLE,
    httpStatus: 503,
    userMessage: 'Document storage is temporarily unavailable.',
  },
];

const matchesMessage = (rule: MapRule, message: string): boolean => {
  if (!rule.messageIncludes) return true;
  if (typeof rule.messageIncludes === 'string') {
    return message.toLowerCase().includes(rule.messageIncludes.toLowerCase());
  }
  return rule.messageIncludes.test(message);
};

/** True when NAS says the JWT/session is invalid — client should re-login. */
export const isNasAuthRetryable = (status: number, message = ''): boolean => {
  if (status !== 401) return false;
  if (/x-agent-token/i.test(message)) return false;
  if (/invalid credentials/i.test(message)) return false;
  return true;
};

export const mapNasHttpError = (
  status: number,
  envelope?: NasEnvelope | null,
  networkMessage?: string,
): StorageError => {
  if (!status || status === 0) {
    return new StorageError(
      'Document storage is temporarily unavailable.',
      503,
      StorageErrorCodes.STORAGE_UNAVAILABLE,
    );
  }

  const nasMessage = String(envelope?.message || networkMessage || '').trim();

  for (const rule of RULES) {
    if (rule.status !== undefined && rule.status !== status) continue;
    if (!matchesMessage(rule, nasMessage)) continue;
    return new StorageError(rule.userMessage, rule.httpStatus, rule.code);
  }

  if (status >= 500) {
    return new StorageError(
      'Document storage error. Please try again.',
      502,
      StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
    );
  }

  if (status >= 400) {
    return new StorageError(
      'Could not complete the document request.',
      status === 400 ? 400 : 502,
      StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
    );
  }

  return new StorageError(
    'Document storage error. Please try again.',
    502,
    StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
  );
};

/** Internal reference for ops/docs — NAS status → generic storage codes. */
export const nasErrorMappingTable = (): Array<{
  nas: string;
  storageCode: string;
  http: number;
  userMessage: string;
}> =>
  RULES.map((r) => ({
    nas: `HTTP ${r.status ?? '*'}${r.messageIncludes ? ` · ${String(r.messageIncludes)}` : ''}`,
    storageCode: r.code,
    http: r.httpStatus,
    userMessage: r.userMessage,
  }));
