/**
 * Example usage — copy `shared/logger` into another service and adjust config/env.
 *
 * import { LoggerManager, logger } from './shared/logger';
 *
 * LoggerManager.getInstance().initialize();
 * logger.info('Service ready');
 * logger.child({ module: 'auth' }).debug('Auth module loaded');
 */

import { LoggerManager } from '../managers/logger.manager';

export const runLoggerExample = (): void => {
  const manager = LoggerManager.getInstance();
  const log = manager.initialize();

  log.info('Infrastructure logger example');
  log.success('Colorful success log');
  log.child({ module: 'example' }).debug('Child logger with context');
};
