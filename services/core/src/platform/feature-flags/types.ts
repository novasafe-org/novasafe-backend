/** Deployment environments for flag resolution. */
export type FeatureFlagEnvironment =
  | 'production'
  | 'staging'
  | 'development'
  | 'enterprise-dev';

export type FeatureFlagCategory = 'product' | 'platform' | 'experiment';

export type FeatureFlagTier = 'personal' | 'teams' | 'enterprise';

/** Client surfaces a flag can gate (UI, API, or extension). */
export type FeatureFlagClientSurface =
  | 'web-app'
  | 'auth'
  | 'landing'
  | 'admin-panel'
  | 'mobile'
  | 'browser-extension'
  | 'mobile-api'
  | 'admin-api';

/** Canonical flag keys — single source of truth for all services and clients. */
export type FeatureFlagKey =
  | 'passkeys'
  | 'otp'
  | 'teams'
  | 'enterprise'
  | 'sharing_v2'
  | 'audit_logs'
  | 'admin_console'
  | 'browser_extension_v2'
  | 'activity_logs'
  | 'scim'
  | 'sso';

export const FEATURE_FLAG_KEYS = [
  'passkeys',
  'otp',
  'teams',
  'enterprise',
  'sharing_v2',
  'audit_logs',
  'admin_console',
  'browser_extension_v2',
  'activity_logs',
  'scim',
  'sso',
] as const satisfies readonly FeatureFlagKey[];

export type FeatureFlagDefaults = Record<FeatureFlagEnvironment, boolean>;

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  displayName: string;
  description: string;
  owner: string;
  category: FeatureFlagCategory;
  tier: FeatureFlagTier;
  introducedIn: string;
  clientSurfaces: readonly FeatureFlagClientSurface[];
  defaults: FeatureFlagDefaults;
}

/** Resolved flag values for a single environment (API / client bootstrap shape). */
export interface FeatureFlagSnapshot {
  version: string;
  environment: FeatureFlagEnvironment;
  flags: Record<FeatureFlagKey, boolean>;
}
