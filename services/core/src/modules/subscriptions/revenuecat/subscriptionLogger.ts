import { logger } from '../../../shared/logger';
import type { LogMeta } from '../../../shared/logger/core/logger.types';

type LogArg = string | LogMeta;

const wrapLogger = (base: ReturnType<typeof logger.child>) => ({
  info: (first: LogArg, second?: LogArg) => {
    if (typeof first === 'string') base.info(first, typeof second === 'object' ? second : undefined);
    else base.info(typeof second === 'string' ? second : '', first);
  },
  warn: (first: LogArg, second?: LogArg) => {
    if (typeof first === 'string') base.warn(first, typeof second === 'object' ? second : undefined);
    else base.warn(typeof second === 'string' ? second : '', first);
  },
  error: (first: LogArg, second?: LogArg) => {
    if (typeof first === 'string') base.error(first, typeof second === 'object' ? second : undefined);
    else base.error(typeof second === 'string' ? second : '', first);
  },
  debug: (first: LogArg, second?: LogArg) => {
    if (typeof first === 'string') base.debug(first, typeof second === 'object' ? second : undefined);
    else base.debug(typeof second === 'string' ? second : '', first);
  },
  child: (ctx: LogMeta) => wrapLogger(base.child(ctx)),
});

export const subscriptionLog = wrapLogger(logger.child({ module: 'subscription' }));

export const webhookLog = subscriptionLog.child({ component: 'revenuecat-webhook' });

export const syncLog = subscriptionLog.child({ component: 'revenuecat-sync' });
