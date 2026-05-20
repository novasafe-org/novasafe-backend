import { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      /** Optional tenant slug from `X-Tenant` (for future multi-tenant use). */
      tenant?: string;
    }
  }
}

/** Reads optional `X-Tenant` header when present (e.g. from a future proxy rule). */
export const tenantMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const fromHeader = String(req.headers["x-tenant"] || "").trim();
  if (fromHeader) req.tenant = fromHeader.slice(0, 63);
  next();
};
