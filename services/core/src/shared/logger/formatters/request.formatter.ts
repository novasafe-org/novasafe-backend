import type { LoggerConfig } from '../config';
import type { RequestLogContext } from '../core/logger.types';
import { colorize, colorizeLevel } from '../utils/color.util';

const statusColor = (status: number, enabled: boolean): string => {
  if (status >= 500) return colorize('red', String(status), enabled);
  if (status >= 400) return colorize('yellow', String(status), enabled);
  if (status >= 300) return colorize('cyan', String(status), enabled);
  return colorize('green', String(status), enabled);
};

export const formatRequestLine = (ctx: RequestLogContext, config: LoggerConfig): string => {
  const method = colorize('bold', ctx.method.padEnd(7), config.enableColors);
  const url = colorize('white', ctx.url, config.enableColors);
  const status = statusColor(ctx.statusCode || 0, config.enableColors);
  const duration = colorize(
    'gray',
    `${ctx.durationMs ?? 0}ms`,
    config.enableColors,
  );
  const requestId = colorize('magenta', `[${ctx.requestId}]`, config.enableColors);
  const ip = ctx.ip ? colorize('gray', ctx.ip, config.enableColors) : '';
  const level = colorizeLevel('http', 'HTTP', config.enableColors);

  return `${level} ${requestId} ${method} ${url} ${status} ${duration} ${ip}`.trim();
};
