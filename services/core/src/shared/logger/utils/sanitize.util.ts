import type { LogMeta } from '../core/logger.types';

export const redactSensitive = (
  value: unknown,
  sensitiveFields: string[],
  depth = 0,
): unknown => {
  if (depth > 6) return '[MaxDepth]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, sensitiveFields, depth + 1));
  }
  if (typeof value !== 'object') return value;

  const output: LogMeta = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactSensitive(val, sensitiveFields, depth + 1) as LogMeta[string];
    }
  }
  return output;
};
