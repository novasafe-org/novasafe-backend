import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [{ target: 'pino-pretty', options: { colorize: true } }],
  },
});

export default logger;
