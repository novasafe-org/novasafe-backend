import { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      tenant?: string;
    }
  }
}

export const tenantMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const tenant = req.headers['x-tenant'];
  if (typeof tenant === 'string' && tenant.trim()) {
    req.tenant = tenant.trim();
  }
  next();
};
