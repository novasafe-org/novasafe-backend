import {
  getFeatureFlagDefinition,
  initializeFeatureFlagCatalog,
  isKnownFeatureFlagKey,
  type FeatureFlagEnvironment,
  type FeatureFlagKey,
} from '@novasafe/feature-flags';

export function assertEnterpriseProductionApproval(input: {
  key: string;
  environment: FeatureFlagEnvironment;
  enabled: boolean;
  approvalNote?: string;
}): void {
  if (!isKnownFeatureFlagKey(input.key)) {
    return;
  }
  initializeFeatureFlagCatalog();
  const definition = getFeatureFlagDefinition(input.key as FeatureFlagKey);
  if (
    input.environment === 'production' &&
    definition.tier === 'enterprise' &&
    input.enabled &&
    !input.approvalNote?.trim()
  ) {
    throw new Error('Production enablement of enterprise-tier flags requires an approval note');
  }
}
