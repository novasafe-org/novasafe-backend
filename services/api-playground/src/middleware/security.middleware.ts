import { Request, Response, NextFunction } from 'express';
import { playgroundConfig } from '../config/playground.config';

/**
 * Blocks playground when disabled (production default) or when API key is required.
 */
export const securityGateMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.path === '/health') {
    next();
    return;
  }

  if (!playgroundConfig.enabled) {
    res.status(403).json({
      success: false,
      code: 'PLAYGROUND_DISABLED',
      message: 'API Playground is disabled. Set PLAYGROUND_ENABLED=true to enable.',
    });
    return;
  }

  if (!playgroundConfig.requireApiKey) {
    next();
    return;
  }

  const provided =
    req.header('x-playground-api-key') ||
    req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
    (typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined);

  if (!playgroundConfig.apiKey || provided !== playgroundConfig.apiKey) {
    res.status(401).json({
      success: false,
      code: 'PLAYGROUND_UNAUTHORIZED',
      message: 'Valid playground API key required (x-playground-api-key or Authorization: Bearer).',
    });
    return;
  }

  next();
};
