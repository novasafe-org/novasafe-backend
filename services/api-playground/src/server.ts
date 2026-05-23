import http from 'http';
import app from './app';
import { playgroundConfig } from './config/playground.config';
import { logger } from './utils/logger';
import { tokenVaultService } from './auth/token-vault.service';
import { historyStore } from './history/history.store';

export const startServer = async (): Promise<http.Server> => {
  await tokenVaultService.load();
  await historyStore.load();

  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(playgroundConfig.port, playgroundConfig.bindHost, () => {
      logger.info('API Playground listening', {
        url: `${playgroundConfig.publicBaseUrl}/docs`,
        port: playgroundConfig.port,
        enabled: playgroundConfig.enabled,
        coreTarget: playgroundConfig.defaultCoreUrl,
      });
      resolve(server);
    });
    server.on('error', reject);
  });
};
