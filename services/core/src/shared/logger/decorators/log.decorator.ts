import { LoggerManager } from '../managers/logger.manager';
import type { LogLevelName } from '../config';

export interface LogDecoratorOptions {
  level?: LogLevelName;
  message?: string;
}

/**
 * Method decorator for lightweight infrastructure tracing (not business audit logs).
 */
export const Log = (options: LogDecoratorOptions = {}) => {
  const level = options.level || 'debug';

  return (
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function wrapped(...args: unknown[]) {
      const logger = LoggerManager.getInstance().getLogger();
      const label = options.message || propertyKey;
      logger[level](`→ ${label}`, { method: propertyKey });

      try {
        const result = await original.apply(this, args);
        logger[level](`← ${label}`, { method: propertyKey, status: 'ok' });
        return result;
      } catch (error) {
        logger.error(`✖ ${label}`, {
          method: propertyKey,
          err: (error as Error).message,
        });
        throw error;
      }
    };

    return descriptor;
  };
};
