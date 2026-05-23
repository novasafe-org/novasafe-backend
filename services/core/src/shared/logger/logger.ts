import { LoggerManager } from './managers/logger.manager';
import type { LoggerService } from './services/logger.service';

let cached: LoggerService | null = null;

export const getAppLogger = (): LoggerService => {
  if (!cached) {
    cached = LoggerManager.getInstance().getLogger();
  }
  return cached;
};

/**
 * Lazy proxy so importing `logger` before `loadEnv` initialization still works
 * once {@link LoggerManager.initialize} has run.
 */
export const logger: LoggerService = new Proxy({} as LoggerService, {
  get(_target, property: string | symbol) {
    const instance = getAppLogger() as LoggerService & Record<string | symbol, unknown>;
    const value = instance[property as keyof LoggerService];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

export default logger;
