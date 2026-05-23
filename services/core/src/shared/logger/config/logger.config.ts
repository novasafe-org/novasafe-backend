import fs from 'node:fs';
import { LOGGER_DEFAULTS } from './logger.constants';
import { resolveLogLevel, type LogLevelName } from './logger.levels';

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test' | string;

export type LogFileOutputMode = 'single' | 'split';

export interface LoggerConfig {
  serviceName: string;
  environment: AppEnvironment;
  level: LogLevelName;
  enableConsole: boolean;
  enableFile: boolean;
  /** When file logging is on: `single` = one app log file; `split` = combined + error files. */
  fileOutputMode: LogFileOutputMode;
  enableRequest: boolean;
  enableErrorStack: boolean;
  enableColors: boolean;
  prettyPrint: boolean;
  jsonFormat: boolean;
  logDir: string;
  maxSize: string;
  maxFiles: string;
  datePattern: string;
  requestBody: boolean;
  responseBody: boolean;
  sensitiveFields: string[];
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const parseList = (value: string | undefined, fallback: string[]): string[] => {
  if (!value?.trim()) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

const resolveEnvironment = (): AppEnvironment =>
  (process.env.NODE_ENV || 'development').toLowerCase();

/** True when running in Docker/Kubernetes (noisy stdout should be avoided). */
export const isContainerRuntime = (): boolean => {
  if (parseBoolean(process.env.LOG_CONTAINER_MODE, false)) return true;
  if (process.env.KUBERNETES_SERVICE_HOST) return true;
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
};

const resolveLogDirectory = (environment: AppEnvironment): string => {
  if (process.env.LOG_DIR?.trim()) {
    return process.env.LOG_DIR.trim();
  }
  if (environment === 'production' || isContainerRuntime()) {
    return LOGGER_DEFAULTS.LOG_DIR_CONTAINER;
  }
  return LOGGER_DEFAULTS.LOG_DIR;
};

const resolveFileOutputMode = (environment: AppEnvironment): LogFileOutputMode => {
  const explicit = process.env.LOG_FILE_MODE?.toLowerCase();
  if (explicit === 'single' || explicit === 'split') return explicit;
  return environment === 'production' || isContainerRuntime() ? 'single' : 'split';
};

const applyEnvironmentDefaults = (
  env: AppEnvironment,
  config: LoggerConfig,
): LoggerConfig => {
  const inContainer = isContainerRuntime();
  const isProd = env === 'production' || inContainer;

  if (isProd) {
    return {
      ...config,
      enableConsole: parseBoolean(process.env.LOG_ENABLE_CONSOLE, false),
      enableFile: parseBoolean(process.env.LOG_ENABLE_FILE, true),
      fileOutputMode: resolveFileOutputMode(env),
      enableColors: parseBoolean(process.env.LOG_ENABLE_COLORS, false),
      prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT, false),
      jsonFormat: parseBoolean(process.env.LOG_JSON_FORMAT, true),
      logDir: resolveLogDirectory(env),
    };
  }

  if (env === 'staging') {
    return {
      ...config,
      enableConsole: parseBoolean(process.env.LOG_ENABLE_CONSOLE, true),
      enableFile: parseBoolean(process.env.LOG_ENABLE_FILE, true),
      fileOutputMode: resolveFileOutputMode(env),
      enableColors: parseBoolean(process.env.LOG_ENABLE_COLORS, true),
      prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT, true),
      jsonFormat: parseBoolean(process.env.LOG_JSON_FORMAT, false),
    };
  }

  // development (default): terminal-friendly, no file unless explicitly enabled
  return {
    ...config,
    enableConsole: parseBoolean(process.env.LOG_ENABLE_CONSOLE, true),
    enableFile: parseBoolean(process.env.LOG_ENABLE_FILE, false),
    fileOutputMode: resolveFileOutputMode(env),
    enableColors: parseBoolean(process.env.LOG_ENABLE_COLORS, true),
    prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT, true),
    jsonFormat: parseBoolean(process.env.LOG_JSON_FORMAT, false),
    logDir: resolveLogDirectory(env),
  };
};

export const loadLoggerConfig = (): LoggerConfig => {
  const environment = resolveEnvironment();

  const base: LoggerConfig = {
    serviceName: process.env.LOG_SERVICE_NAME || LOGGER_DEFAULTS.SERVICE_NAME,
    environment,
    level: resolveLogLevel(process.env.LOG_LEVEL || LOGGER_DEFAULTS.LOG_LEVEL),
    enableConsole: true,
    enableFile: false,
    fileOutputMode: 'split',
    enableRequest: parseBoolean(process.env.LOG_ENABLE_REQUEST, true),
    enableErrorStack: parseBoolean(process.env.LOG_ENABLE_ERROR_STACK, true),
    enableColors: true,
    prettyPrint: true,
    jsonFormat: false,
    logDir: resolveLogDirectory(environment),
    maxSize: process.env.LOG_MAX_SIZE || LOGGER_DEFAULTS.LOG_MAX_SIZE,
    maxFiles: process.env.LOG_MAX_FILES || LOGGER_DEFAULTS.LOG_MAX_FILES,
    datePattern: process.env.LOG_DATE_PATTERN || LOGGER_DEFAULTS.LOG_DATE_PATTERN,
    requestBody: parseBoolean(process.env.LOG_REQUEST_BODY, false),
    responseBody: parseBoolean(process.env.LOG_RESPONSE_BODY, false),
    sensitiveFields: parseList(
      process.env.LOG_SENSITIVE_FIELDS,
      [...LOGGER_DEFAULTS.SENSITIVE_FIELDS],
    ),
  };

  return applyEnvironmentDefaults(environment, base);
};

export const loggerConfig: LoggerConfig = loadLoggerConfig();
