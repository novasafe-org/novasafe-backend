export type ReadableError = {
  message: string;
  code?: string;
  category: string;
};

const isMongoError = (error: Error): boolean =>
  error.name.includes('Mongo') ||
  error.message.includes('MongoServerSelectionError') ||
  error.message.includes('MongoNetworkError');

const isTlsError = (error: Error): boolean =>
  error.message.includes('SSL routines') ||
  error.message.includes('ERR_SSL') ||
  error.message.includes('tlsv1 alert');

/**
 * Short, operator-friendly error text for console and API responses.
 * Full stacks belong in file logs when LOG_ENABLE_ERROR_STACK=true.
 */
export const toReadableError = (error: unknown): ReadableError => {
  if (!(error instanceof Error)) {
    return { category: 'unknown', message: String(error) };
  }

  if (isMongoError(error) || isTlsError(error)) {
    return {
      category: 'database',
      code: 'DATABASE_UNAVAILABLE',
      message:
        'Database is unreachable (TLS/network). Verify Atlas IP allowlist, VPN, and MONGO_* / VAULT_DB_* credentials.',
    };
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return {
      category: 'auth',
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired authentication token.',
    };
  }

  const firstLine = error.message.split('\n')[0]?.trim() || error.message;
  return {
    category: error.name || 'error',
    message: firstLine.slice(0, 500),
  };
};
