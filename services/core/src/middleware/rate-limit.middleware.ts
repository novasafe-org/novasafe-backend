import type { Request, RequestHandler } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn: (req: Request) => string;
  message?: string;
};

export const createRateLimiter = (options: RateLimitOptions): RequestHandler => {
  const message = options.message ?? 'Too many requests. Try again later.';
  return (req, res, next) => {
    const key = options.keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ success: false, message, retryAfterSeconds });
    }
    return next();
  };
};

const clientIp = (req: Request): string =>
  String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();

export const authRateLimitKey = (req: Request): string => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return `auth:${clientIp(req)}:${email || 'no-email'}`;
};

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: authRateLimitKey,
  message: 'Too many authentication attempts. Try again later.',
});
