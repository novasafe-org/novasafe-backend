import { RequestSource } from '../../request-context/types';
import { TrustLevel, type ClientTrustContext } from '../types';

export type SourcePolicyRule = {
  id: string;
  allowedSources: RequestSource[];
  minimumTrust?: TrustLevel;
  description: string;
};

export const SOURCE_SECURITY_POLICIES: SourcePolicyRule[] = [
  {
    id: 'admin.routes',
    allowedSources: [RequestSource.AdminPanel, RequestSource.InternalService],
    minimumTrust: TrustLevel.Verified,
    description: 'Admin APIs',
  },
  {
    id: 'extension.autofill',
    allowedSources: [RequestSource.BrowserExtension],
    minimumTrust: TrustLevel.Limited,
    description: 'Extension autofill APIs',
  },
  {
    id: 'mobile.vault',
    allowedSources: [RequestSource.MobileAndroid, RequestSource.MobileIos],
    minimumTrust: TrustLevel.Unverified,
    description: 'Mobile vault APIs',
  },
];

export type SourcePolicyResult =
  | { allowed: true }
  | { allowed: false; reason: string; policyId: string };

const TRUST_ORDER: TrustLevel[] = [
  TrustLevel.Blocked,
  TrustLevel.Suspicious,
  TrustLevel.Unverified,
  TrustLevel.Limited,
  TrustLevel.Verified,
  TrustLevel.Trusted,
];

const meetsMinimumTrust = (actual: TrustLevel, minimum?: TrustLevel): boolean => {
  if (!minimum) return true;
  return TRUST_ORDER.indexOf(actual) >= TRUST_ORDER.indexOf(minimum);
};

/**
 * Evaluates route policy against **verified** source when available, else declared.
 * Non-blocking by default — returns result for future enforcement middleware.
 */
export const evaluateSourceSecurityPolicy = (
  trust: ClientTrustContext,
  policyId: string,
): SourcePolicyResult => {
  const rule = SOURCE_SECURITY_POLICIES.find((r) => r.id === policyId);
  if (!rule) return { allowed: true };

  const effectiveSource = trust.verifiedSource ?? trust.declaredSource;
  if (!rule.allowedSources.includes(effectiveSource)) {
    return {
      allowed: false,
      policyId,
      reason: `Source ${effectiveSource} not allowed for policy ${policyId}`,
    };
  }

  if (!meetsMinimumTrust(trust.trustLevel, rule.minimumTrust)) {
    return {
      allowed: false,
      policyId,
      reason: `Trust level ${trust.trustLevel} below minimum for ${policyId}`,
    };
  }

  return { allowed: true };
};
