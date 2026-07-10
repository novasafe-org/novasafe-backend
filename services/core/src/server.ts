import type { Server } from 'http';
import app, { initializeApp } from './app';
import { ConnectionManager } from './database';
import { LoggerManager, logger } from './shared/logger';

const PORT = Number(process.env.CORE_PORT || process.env.PORT || 3125);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

let httpServer: Server | null = null;

export const startServer = async (): Promise<Server> => {
  await initializeApp();

  return new Promise((resolve, reject) => {
    httpServer = app.listen(PORT, BIND_HOST, () => {
      const dbStatus = ConnectionManager.getInstance().getStatus();
      LoggerManager.getInstance().printStartupBanner({
        port: PORT,
        bind: BIND_HOST,
        database: {
          state: dbStatus.state,
          ready: dbStatus.ready,
          dbName: dbStatus.dbName,
          host: dbStatus.host,
        },
      });
      resolve(httpServer as Server);
    });

    httpServer.on('error', (err) => {
      const failed = httpServer;
      httpServer = null;
      failed?.close(() => undefined);
      reject(err);
    });
  });
};

export const stopServer = async (): Promise<void> => {
  const server = httpServer;
  if (!server) return;

  httpServer = null;

  // Drop keep-alive sockets so the port is released promptly (Node 18+).
  const closeable = server as Server & { closeAllConnections?: () => void };
  closeable.closeAllConnections?.();

  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  logger.info('HTTP server stopped');
};
