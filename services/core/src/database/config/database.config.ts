/**
 * Centralized, environment-driven MongoDB configuration.
 */

export type DatabaseEnvironment = 'development' | 'test' | 'production' | string;

export interface DatabaseConnectionOptions {
  maxPoolSize: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS: number;
  retryReads: boolean;
  retryWrites: boolean;
  family?: number;
}

export interface DatabaseRetryConfig {
  attempts: number;
  delayMs: number;
}

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  environment: DatabaseEnvironment;
  connection: DatabaseConnectionOptions;
  retry: DatabaseRetryConfig;
}

export interface DatabaseConfigValidationResult {
  valid: boolean;
  errors: string[];
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Prefer MONGO_*; fall back to mobile_vault names (VAULT_DB_*). */
const envFirst = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
};

/**
 * Builds a MongoDB URI from discrete env vars when `MONGO_URI` is not set.
 */
export const buildMongoUriFromParts = (parts: {
  user?: string;
  password?: string;
  host?: string;
  dbName?: string;
}): string => {
  const user = parts.user?.trim();
  const password = parts.password?.trim();
  const host = parts.host?.trim();
  const dbName = parts.dbName?.trim() || 'vault';

  if (!host) {
    return `mongodb://127.0.0.1:27017/${dbName}`;
  }

  if (user && password) {
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);
    const isSrv = !host.includes(':') && !host.startsWith('mongodb');
    if (isSrv) {
      return `mongodb+srv://${encodedUser}:${encodedPassword}@${host}/${dbName}?retryWrites=true&w=majority`;
    }
    return `mongodb://${encodedUser}:${encodedPassword}@${host}/${dbName}?retryWrites=true&w=majority`;
  }

  return `mongodb://${host}/${dbName}?retryWrites=true&w=majority`;
};

export const resolveDatabaseUri = (): string => {
  const direct = envFirst('MONGO_URI');
  if (direct) return direct;

  return buildMongoUriFromParts({
    user: envFirst('MONGO_USER', 'VAULT_DB_USERNAME'),
    password: envFirst('MONGO_PASSWORD', 'VAULT_DB_PASSWORD'),
    host: envFirst('MONGO_HOST', 'VAULT_DB_HOST'),
    dbName: envFirst('MONGO_DB_NAME', 'VAULT_DB_NAME'),
  });
};

export const loadDatabaseConfig = (): DatabaseConfig => {
  const dbName = envFirst('MONGO_DB_NAME', 'VAULT_DB_NAME') || 'vault';
  const timeoutMs = parsePositiveInt(process.env.MONGO_TIMEOUT, 10_000);

  return {
    uri: resolveDatabaseUri(),
    dbName,
    environment: (process.env.NODE_ENV || 'development') as DatabaseEnvironment,
    connection: {
      maxPoolSize: parsePositiveInt(process.env.MONGO_POOL_SIZE, 10),
      serverSelectionTimeoutMS: timeoutMs,
      socketTimeoutMS: timeoutMs,
      retryReads: true,
      retryWrites: true,
      family: 4,
    },
    retry: {
      attempts: parseNonNegativeInt(process.env.MONGO_RETRY_ATTEMPTS, 5),
      delayMs: parsePositiveInt(process.env.MONGO_RETRY_DELAY, 2_000),
    },
  };
};

export const validateDatabaseConfig = (
  config: DatabaseConfig = loadDatabaseConfig(),
): DatabaseConfigValidationResult => {
  const errors: string[] = [];

  if (!config.uri) {
    errors.push('MONGO_URI (or MONGO_HOST + credentials) is required');
  } else if (!config.uri.startsWith('mongodb://') && !config.uri.startsWith('mongodb+srv://')) {
    errors.push('MONGO_URI must start with mongodb:// or mongodb+srv://');
  }

  if (!config.dbName?.trim()) {
    errors.push('MONGO_DB_NAME is required');
  }

  if (config.connection.maxPoolSize < 1) {
    errors.push('MONGO_POOL_SIZE must be at least 1');
  }

  if (config.retry.attempts < 0) {
    errors.push('MONGO_RETRY_ATTEMPTS must be >= 0');
  }

  if (config.retry.delayMs < 1) {
    errors.push('MONGO_RETRY_DELAY must be at least 1');
  }

  return { valid: errors.length === 0, errors };
};

/** Singleton-ready config instance (loaded once per process). */
export const databaseConfig: DatabaseConfig = loadDatabaseConfig();
