import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'secret', 'apiKey', 'refreshToken'];

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const isContainerRuntime = (): boolean => {
  if (parseBoolean(process.env.LOG_CONTAINER_MODE, false)) return true;
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
};

const redactValue = (key: string, value: unknown): unknown => {
  if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
    return '[REDACTED]';
  }
  return value;
};

const redactObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactObject(value as Record<string, unknown>);
    } else {
      out[key] = redactValue(key, value);
    }
  }
  return out;
};

const environment = (process.env.NODE_ENV || 'development').toLowerCase();
const inContainer = isContainerRuntime();
const isProd = environment === 'production' || inContainer;

const config = {
  serviceName: process.env.LOG_SERVICE_NAME || 'admin-api',
  environment,
  level: process.env.LOG_LEVEL || 'info',
  enableConsole: parseBoolean(process.env.LOG_ENABLE_CONSOLE, !isProd),
  enableFile: parseBoolean(process.env.LOG_ENABLE_FILE, isProd),
  logDir: process.env.LOG_DIR?.trim() || (inContainer ? '/app/logs' : 'logs'),
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '90d',
  datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
  jsonFormat: parseBoolean(process.env.LOG_JSON_FORMAT, isProd),
  enableErrorStack: parseBoolean(process.env.LOG_ENABLE_ERROR_STACK, true),
};

const ensureLogDir = (logDir: string): string => {
  const resolved = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
};

const jsonLineFormat = winston.format.printf((info) => {
  const record: Record<string, unknown> = {
    service: config.serviceName,
    environment: config.environment,
    level: info.level,
    message: String(info.message ?? ''),
    timestamp: info.timestamp,
  };

  if (info.stack && config.enableErrorStack) {
    record.stack = info.stack;
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (['level', 'message', 'timestamp', 'service', 'environment', 'stack'].includes(key)) {
      continue;
    }
    if (value !== undefined) {
      extras[key] = value;
    }
  }

  Object.assign(record, redactObject(extras));
  return JSON.stringify(record);
});

const structuredFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: config.enableErrorStack }),
  jsonLineFormat,
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(redactObject(meta as Record<string, unknown>))}` : '';
    return `${timestamp} [${level}] ${message}${rest}`;
  }),
);

const transports: winston.transport[] = [];

if (config.enableConsole) {
  transports.push(
    new winston.transports.Console({
      level: config.level,
      format: config.jsonFormat ? structuredFormat : consoleFormat,
    }),
  );
}

if (config.enableFile) {
  const logDir = ensureLogDir(config.logDir);
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: config.datePattern,
      maxSize: config.maxSize,
      maxFiles: config.maxFiles,
      level: config.level,
      format: structuredFormat,
      zippedArchive: true,
    }),
  );
}

if (transports.length === 0) {
  transports.push(new winston.transports.Console({ level: config.level, format: consoleFormat }));
}

export const logger = winston.createLogger({
  level: config.level,
  transports,
});
