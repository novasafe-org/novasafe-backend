import { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      source?: string;
    }
  }
}

export const sourceMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  req.source = 'mobile';

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.source = 'mobile';
  }

  next();
};
