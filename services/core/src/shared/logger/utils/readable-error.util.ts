export type ReadableError = {
  message: string;
  code?: string;
  category: string;
};

const isMongoConnectivityError = (error: Error): boolean =>
  error.message.includes('MongoServerSelectionError') ||
  error.message.includes('MongoNetworkError') ||
  error.message.includes('connection timed out') ||
  error.message.includes('ECONNREFUSED');

const isTlsError = (error: Error): boolean =>
  error.message.includes('SSL routines') ||
  error.message.includes('ERR_SSL') ||
  error.message.includes('tlsv1 alert');

const isMongoWriteError = (error: Error): boolean =>
  error.name.includes('Mongo') &&
  !isMongoConnectivityError(error) &&
  !isTlsError(error);

/**
 * Short, operator-friendly error text for console and API responses.
 * Full stacks belong in file logs when LOG_ENABLE_ERROR_STACK=true.
 */
export const toReadableError = (error: unknown): ReadableError => {
  if (!(error instanceof Error)) {
    return { category: 'unknown', message: String(error) };
  }

  if (isTlsError(error) || isMongoConnectivityError(error)) {
    const detail = error.message.split('\n')[0]?.trim() || error.name;
    return {
      category: 'database',
      code: 'DATABASE_UNAVAILABLE',
      message:
        `Database is unreachable (TLS/network). ${detail} — verify Atlas IP allowlist, VPN, and MONGO_* / VAULT_DB_* credentials.`,
    };
  }

  if (isMongoWriteError(error)) {
    const detail = error.message.split('\n')[0]?.trim() || error.name;
    return {
      category: 'database_write',
      code: 'DATABASE_WRITE_ERROR',
      message: detail.slice(0, 500),
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
