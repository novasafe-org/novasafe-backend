import type { PlatformCapability } from '../../shared/request-context/types';
import type { FeatureFlagKey } from './types';

/**
 * Maps feature flags to platform capabilities merged into request context.
 * When a flag is disabled, bound capabilities are removed from the base set.
 */
export const FEATURE_FLAG_CAPABILITY_BINDINGS: Partial<
  Record<FeatureFlagKey, readonly PlatformCapability[]>
> = {
  passkeys: ['webauthn'],
  browser_extension_v2: ['autofill', 'offline_vault'],
};

export const applyFeatureFlagsToCapabilities = (
  base: PlatformCapability[],
  flags?: Partial<Record<FeatureFlagKey, boolean>>,
): PlatformCapability[] => {
  if (!flags) {
    return base;
  }

  let result = [...base];

  for (const [rawKey, capabilities] of Object.entries(FEATURE_FLAG_CAPABILITY_BINDINGS)) {
    const key = rawKey as FeatureFlagKey;
    const enabled = flags[key] ?? false;

    if (enabled) {
      for (const capability of capabilities) {
        if (!result.includes(capability)) {
          result.push(capability);
        }
      }
      continue;
    }

    result = result.filter((capability) => !capabilities.includes(capability));
  }

  return result;
};
