import type { LoggerConfig } from '../config';
import type { RequestLogContext } from '../core/logger.types';
import { colorize, colorizeLevel } from '../utils/color.util';

/** Plain, aggregation-safe HTTP request summary (no ANSI). */
export const buildPlainRequestMessage = (ctx: RequestLogContext): string => {
  const status = ctx.statusCode ?? 0;
  const duration = `${ctx.durationMs ?? 0}ms`;
  const parts = [ctx.method, ctx.url, String(status), duration].filter(Boolean);
  return parts.join(' ');
};

const statusColor = (status: number, enabled: boolean): string => {
  if (status >= 500) return colorize('red', String(status), enabled);
  if (status >= 400) return colorize('yellow', String(status), enabled);
  if (status >= 300) return colorize('cyan', String(status), enabled);
  return colorize('green', String(status), enabled);
};

/** Colorized HTTP summary (method/url/status/duration/ip only — no duplicate HTTP label). */
export const formatColoredRequestSummary = (
  ctx: RequestLogContext,
  config: LoggerConfig,
): string => {
  const statusNum = ctx.statusCode || 0;
  const lineColor = statusNum >= 500 ? 'red' : statusNum >= 400 ? 'yellow' : null;

  const method = colorize('bold', ctx.method.padEnd(7), config.enableColors);
  const url = colorize(lineColor || 'white', ctx.url, config.enableColors);
  const status = statusColor(statusNum, config.enableColors);
  const duration = colorize('gray', `${ctx.durationMs ?? 0}ms`, config.enableColors);
  const ip = ctx.ip ? colorize('gray', ctx.ip, config.enableColors) : '';
  const line = `${method} ${url} ${status} ${duration} ${ip}`.trim();
  return lineColor && config.enableColors ? colorize(lineColor, line, true) : line;
};

/** @deprecated Use formatColoredRequestSummary */
export const formatColoredRequestLine = (
  ctx: RequestLogContext,
  config: LoggerConfig,
): string => {
  const requestId = colorize('magenta', `[${ctx.requestId}]`, config.enableColors);
  const level = colorizeLevel('http', 'HTTP', config.enableColors);
  return `${level} ${requestId} ${formatColoredRequestSummary(ctx, config)}`;
};

export const formatRequestLine = formatColoredRequestLine;
