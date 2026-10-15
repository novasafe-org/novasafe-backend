import { Router } from 'express';

import { createChangelogRoutes } from './changelog/changelog.routes';
import { createFeatureFlagRoutes } from './feature-flags/feature-flags.routes';
import { createRbacRoutes } from './rbac/rbac.routes';
import { createStatusAdminRoutes } from './status/status.routes';
import { createTemplateRoutes } from './templates/template.routes';
import { createUsersRoutes } from './users/users.routes';
import { createServiceAccountRoutes } from './service-accounts/service-accounts.routes';

export async function registerAdminModules(app: import('express').Express, apiPrefix: string): Promise<void> {
  const router = Router();

  router.use(createRbacRoutes());
  router.use('/feature-flags', createFeatureFlagRoutes());
  router.use('/changelog', createChangelogRoutes());
  router.use('/status', createStatusAdminRoutes());
  router.use('/templates', createTemplateRoutes());
  router.use('/users', createUsersRoutes());
  router.use('/service-accounts', createServiceAccountRoutes());

  app.use(apiPrefix, router);

  const { registerBlogRoutes } = await import('./blog/register');
  await registerBlogRoutes(app);
}
