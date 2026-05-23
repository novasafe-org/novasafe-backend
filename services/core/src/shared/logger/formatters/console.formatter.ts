import winston from 'winston';
import type { LoggerConfig } from '../config';
import { colorize, colorizeLevel } from '../utils/color.util';
import { formatLocalTimestamp } from '../utils/timestamp.util';
import type { LogLevelName } from '../config';

const stringifyMeta = (meta: unknown): string => {
  if (!meta || typeof meta !== 'object') return '';
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
};

export const formatConsoleLine = (
  info: winston.Logform.TransformableInfo,
  config: LoggerConfig,
): string => {
  const level = String(info.level) as LogLevelName;
  const timestamp = formatLocalTimestamp(
    info.timestamp ? new Date(String(info.timestamp)) : new Date(),
  );
  const service = info.service ? colorize('gray', `[${info.service}]`, config.enableColors) : '';
  const sourceTag =
    info.sourceLabel || info.context
      ? colorize('cyan', String(info.sourceLabel || info.context), config.enableColors)
      : '';
  const requestId = info.requestId
    ? colorize('magenta', `[${info.requestId}]`, config.enableColors)
    : '';
  const levelLabel = colorizeLevel(level, level.toUpperCase().padEnd(7), config.enableColors);
  const message = colorize('white', String(info.message), config.enableColors);
  const meta =
    info.meta && Object.keys(info.meta as object).length > 0
      ? `\n${colorize('gray', stringifyMeta(info.meta), config.enableColors)}`
      : '';

  const sourcePrefix = sourceTag ? `${sourceTag} ` : '';
  return `${colorize('gray', timestamp, config.enableColors)} ${levelLabel} ${service} ${sourcePrefix}${requestId} ${message}${meta}`;
};

export const createConsoleFormat = (config: LoggerConfig) =>
  winston.format.printf((info) => formatConsoleLine(info, config));
