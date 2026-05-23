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

/** Placeholder: merge remote feature-flag payload into capabilities. */
export const mergeCapabilities = (
  base: PlatformCapability[],
  _flags?: Record<string, boolean>,
): PlatformCapability[] => base;
