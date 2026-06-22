import { Router } from 'express';

import { createChangelogRoutes } from './changelog/changelog.routes';
import { createRbacRoutes } from './rbac/rbac.routes';
import { createStatusAdminRoutes } from './status/status.routes';
import { createTemplateRoutes } from './templates/template.routes';
import { createUsersRoutes } from './users/users.routes';

export async function registerAdminModules(app: import('express').Express, apiPrefix: string): Promise<void> {
  const router = Router();

  router.use(createRbacRoutes());
  router.use('/changelog', createChangelogRoutes());
  router.use('/status', createStatusAdminRoutes());
  router.use('/templates', createTemplateRoutes());
  router.use('/users', createUsersRoutes());

  app.use(apiPrefix, router);

  const { registerBlogRoutes } = await import('./blog/register');
  await registerBlogRoutes(app);
}
