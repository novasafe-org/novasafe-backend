import pino from 'pino';

const logger = pino({
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