import { ConnectionManager } from './database';
import { LoggerManager, logger } from './shared/logger';
import { stopServer } from './server';

let shuttingDown = false;

export const registerGracefulShutdown = (): void => {
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn('Graceful shutdown started', { signal });

    try {
      await stopServer();
      await ConnectionManager.getInstance().shutdown();
      await LoggerManager.getInstance().shutdown();
      logger.success('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', { err: (error as Error).message });
      process.exit(1);
    }
  };

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) {
    process.on(signal, () => shutdown(signal));
  }
};
