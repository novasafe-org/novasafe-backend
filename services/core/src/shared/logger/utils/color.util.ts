import pc from 'picocolors';
import { LOG_LEVEL_COLORS, type LogLevelName } from '../config';

const LEVEL_COLOR_FN: Record<string, (value: string) => string> = {
  red: pc.red,
  yellow: pc.yellow,
  green: pc.green,
  cyan: pc.cyan,
  magenta: pc.magenta,
  gray: pc.gray,
  blue: pc.blue,
  white: pc.white,
};

export const colorizeLevel = (level: LogLevelName, text: string, enabled = true): string => {
  if (!enabled) return text;
  const colorName = LOG_LEVEL_COLORS[level] || 'white';
  const colorFn = LEVEL_COLOR_FN[colorName] || pc.white;
  return colorFn(text);
};

export const colorize = (color: keyof typeof pc, text: string, enabled = true): string => {
  if (!enabled) return text;
  const fn = pc[color];
  return typeof fn === 'function' ? (fn as (v: string) => string)(text) : text;
};

export { pc };
