export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  success: 2,
  info: 3,
  http: 4,
  verbose: 5,
  debug: 6,
  audit: 7,
} as const;

export type LogLevelName = keyof typeof LOG_LEVELS;

export const LOG_LEVEL_COLORS: Record<LogLevelName, string> = {
  error: 'red',
  warn: 'yellow',
  success: 'green',
  info: 'cyan',
  http: 'magenta',
  verbose: 'gray',
  debug: 'blue',
  audit: 'white',
};

export const resolveLogLevel = (level?: string): LogLevelName => {
  const normalized = (level || 'info').toLowerCase() as LogLevelName;
  return normalized in LOG_LEVELS ? normalized : 'info';
};
