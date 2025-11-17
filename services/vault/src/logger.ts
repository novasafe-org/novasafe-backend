import pino from 'pino';
import dotenv from 'dotenv';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info', // Dynamically set log level
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: true // Enables pretty-printing with colors
        }
      }
    ]
  }
});

export default logger;