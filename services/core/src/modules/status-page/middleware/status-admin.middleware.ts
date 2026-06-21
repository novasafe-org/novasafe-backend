import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import {
  isStatusPageAdminSecretConfigured,
  STATUS_PAGE_CONFIG,
} from '../config/status-page.config';
import { authMiddleware } from '../../auth';

const normalizeBearer = (header: string | undefined): string => {
  const raw = String(header || '').trim();
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
};

const verifyAdminSecret = (authorizationHeader: string | undefined): boolean => {
  const secret = STATUS_PAGE_CONFIG.adminSecret;
  if (!secret) return false;

  const providedRaw = normalizeBearer(authorizationHeader);
  if (!providedRaw) return false;

  const provided = Buffer.from(providedRaw, 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
};

/**
 * Admin access via STATUS_PAGE_ADMIN_SECRET bearer token.
 * When secret is not configured, falls back to standard JWT auth (development).
 */
export const statusAdminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (isStatusPageAdminSecretConfigured()) {
    if (verifyAdminSecret(req.headers.authorization)) {
      next();
      return;
    }
    res.status(401).json({ success: false, message: 'Invalid status page admin authorization' });
    return;
  }

  return authMiddleware(req, res, next);
};
