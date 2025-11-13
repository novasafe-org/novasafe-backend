import { Request, Response, NextFunction } from 'express';
import logger from '../../logger';

const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.url}`);
  next();
};

export default loggerMiddleware;