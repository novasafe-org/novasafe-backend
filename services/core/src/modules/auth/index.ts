import { Express } from 'express';
import { createAuthRoutes, createMobileSessionRoutes } from './routes/auth.routes';
import { createOnboardingRoutes } from './routes/onboarding.routes';

export const AUTH_MODULE_NAME = 'auth';

/** Re-export guards for other modules (vault, settings, etc.). */
export {
  authAllowRevokedSessionMiddleware,
  authMiddleware,
  oauthPendingAuthMiddleware,
  sessionOrPendingAuthMiddleware,
} from './middleware/auth.middleware';

export { getJwtTokenService } from './tokens/jwt.token.service';
export {
  assertCanCreateVaultItem,
  assertEntitlement,
  getSubscriptionStateForUser,
} from '../subscriptions';
export type { AuthUserDto, AuthSuccessResponse } from './types/auth.types';

/**
 * Registers auth routes under API prefix and legacy mobile paths for backward compatibility.
 * Refresh / step-up session routes are mounted only on `/mobile/auth`.
 */
export const registerAuthModule = (app: Express, apiPrefix: string): void => {
  const authRoutes = createAuthRoutes();
  const mobileSessionRoutes = createMobileSessionRoutes();
  const onboardingRoutes = createOnboardingRoutes();

  /** Web / extension / shared API surface — no refresh or step-up. */
  app.use(`${apiPrefix}/${AUTH_MODULE_NAME}`, authRoutes);
  app.use(`${apiPrefix}/onboarding`, onboardingRoutes);

  /** Mobile app paths — shared auth + mobile-only session continuity. */
  app.use('/mobile/auth', authRoutes);
  app.use('/mobile/auth', mobileSessionRoutes);
  app.use('/mobile/onboarding', onboardingRoutes);
};
