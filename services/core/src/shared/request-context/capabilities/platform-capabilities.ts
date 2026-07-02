import { applyFeatureFlagsToCapabilities } from '../../../platform/feature-flags/capability-bindings';
import type { FeatureFlagKey } from '../../../platform/feature-flags/types';
import { RequestSource, type PlatformCapability } from '../types';

/** Default capabilities per client source (extend via feature flags later). */
const CAPABILITY_MATRIX: Record<RequestSource, PlatformCapability[]> = {
  [RequestSource.MobileAndroid]: ['biometrics', 'offline_vault', 'push_notifications', 'autofill'],
  [RequestSource.MobileIos]: ['biometrics', 'offline_vault', 'push_notifications', 'autofill'],
  [RequestSource.WebApp]: ['webauthn', 'file_export'],
  [RequestSource.BrowserExtension]: ['autofill', 'offline_vault'],
  [RequestSource.DesktopApp]: ['biometrics', 'offline_vault', 'file_export'],
  [RequestSource.AdminPanel]: ['file_export'],
  [RequestSource.InternalService]: [],
  [RequestSource.PublicApi]: [],
  [RequestSource.Unknown]: [],
};

export const resolveDefaultCapabilities = (source: RequestSource): PlatformCapability[] => [
  ...(CAPABILITY_MATRIX[source] ?? []),
];

/** Merge remote feature-flag payload into platform capabilities. */
export const mergeCapabilities = (
  base: PlatformCapability[],
  flags?: Partial<Record<FeatureFlagKey, boolean>> | Record<string, boolean>,
): PlatformCapability[] => {
  if (!flags) {
    return base;
  }
  return applyFeatureFlagsToCapabilities(base, flags as Partial<Record<FeatureFlagKey, boolean>>);
};
