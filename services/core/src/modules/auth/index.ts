import { Express } from 'express';
import { createAuthRoutes } from './routes/auth.routes';
import { createOnboardingRoutes } from './routes/onboarding.routes';

export const AUTH_MODULE_NAME = 'auth';

/** Re-export guards for other modules (vault, settings, etc.). */
export {
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
 */
export const registerAuthModule = (app: Express, apiPrefix: string): void => {
  const authRoutes = createAuthRoutes();
  const onboardingRoutes = createOnboardingRoutes();

  app.use(`${apiPrefix}/${AUTH_MODULE_NAME}`, authRoutes);
  app.use(`${apiPrefix}/onboarding`, onboardingRoutes);

  /** Legacy mobile_vault paths — same handlers, no mobile_vault changes required during cutover. */
  app.use('/mobile/auth', authRoutes);
  app.use('/mobile/onboarding', onboardingRoutes);
};
