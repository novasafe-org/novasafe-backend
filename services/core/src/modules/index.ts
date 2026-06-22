import { Express } from 'express';
import { registerAuthModule } from './auth';
import { registerDashboardModule } from './dashboard';
import { registerDocsModule } from './docs';
import { registerPlatformModule } from './platform';
import { registerSettingsModule } from './settings';
import { registerSharingModule } from './sharing';
import { registerSubscriptionsModule } from './subscriptions';
import { registerUsersModule } from './users';
import { registerVaultModule } from './vault';
import { registerStatusPageModule } from './status-page';
import { registerBlogProxyModule } from './blog-proxy';
import { appConfig } from '../config';

/**
 * Mounts all core modules under the API prefix and legacy `/mobile/*` paths.
 */
export const registerModuleRoutes = (app: Express): void => {
  const prefix = appConfig.apiPrefix;

  registerDocsModule(app, prefix);
  registerPlatformModule(app, prefix);
  registerAuthModule(app, prefix);
  registerUsersModule(app, prefix);
  registerVaultModule(app, prefix);
  registerSettingsModule(app, prefix);
  registerDashboardModule(app, prefix);
  registerSharingModule(app, prefix);
  registerSubscriptionsModule(app, prefix);
  registerStatusPageModule(app, prefix);
  registerBlogProxyModule(app, prefix);
};
