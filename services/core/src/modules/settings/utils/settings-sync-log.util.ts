import type { Response } from 'express';
import { LoggerManager } from '../../../shared/logger/managers/logger.manager';
import type { LogMeta } from '../../../shared/logger/core/logger.types';
import type { SubscriptionState } from '../../subscriptions/revenuecat/types';

const parseBoolean = (value: string | undefined): boolean =>
  ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

export const isSettingsSyncDetailLoggingEnabled = (): boolean =>
  parseBoolean(process.env.LOG_SETTINGS_SYNC_DETAIL);

/** Prevent CDN/proxy/browser from caching sync preference (avoids stale 304 on GET). */
export const applySyncSettingsCacheHeaders = (res: Response): void => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

export const logSettingsSync = (event: string, meta: LogMeta): void => {
  if (!isSettingsSyncDetailLoggingEnabled()) return;
  LoggerManager.getInstance()
    .getLogger()
    .info(`settings-sync:${event}`, meta);
};

export const subscriptionSnapshot = (state: SubscriptionState): LogMeta => ({
  tier: state.tier,
  isPro: state.isPro,
  isActive: state.isActive,
  expiresAt: state.expiresAt,
  inGracePeriod: state.inGracePeriod,
  canUseCloudSync: state.entitlements?.canUseCloudSync,
  canUseMultiDevice: state.entitlements?.canUseMultiDevice,
});
