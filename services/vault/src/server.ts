import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import loggerMiddleware from './middlewares/logger/loggerMiddleware';
import healthRoute from './routes/healthRoute';
import vaultRoute from './routes/vaultRoute';
import authRoute from './routes/authRoute';
import totpRoute from './routes/totpRoute';
import sessionRoute from './routes/sessionRoute';
import folderRoute from './routes/folderRoute';
import settingsRoute from './routes/settingsRoute';
import shareRoute from './routes/shareRoute';
import Database from '../database/connection'; // Import Database class
import logger from './logger';
import { DBCONFIG } from '../config/config';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3123;

// Add CORS and JSON parsing middleware
app.use(express.json());
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Use logging middleware
app.use(loggerMiddleware);

// Define routes
app.use('/health', healthRoute);
app.use('/v/auth', authRoute);
app.use('/v/auth/2fa', totpRoute);
app.use('/v/auth/sessions', sessionRoute);
app.use('/v', vaultRoute);
app.use('/v/folders', folderRoute);
app.use('/v/api/settings', settingsRoute);
app.use('/v/share', shareRoute);

// Establish database connection at server startup
const initializeDatabase = async () => {
  try {
    new Database(DBCONFIG.vault.databaseName);
  } catch (error) {
    logger.error(`Error establishing database connection: ${error}`);
    process.exit(1); // Exit the process if the database connection fails
  }
};

export const startServer = async () => {
  await initializeDatabase(); // Ensure database connection is established before starting the server

  app.listen(Number(PORT), '0.0.0.0', () => {
    logger.info('#'.repeat(50));
    logger.info(`Vault service running on port ${PORT}`);
    logger.info(`Internal access: http://localhost:${PORT}`);
    logger.info(`External access: http://0.0.0.0:${PORT}`);
    logger.info(`Docker access: http://64.227.135.126:${PORT}`);
    logger.info('#'.repeat(50));
  });
};