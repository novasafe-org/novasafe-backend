import type { RequestSource } from '../../request-context/types';
import { getRequestContext } from '../../request-context';
import { evaluateSourceSecurityPolicy } from '../policies/source-security.policy';
import type { TrustLevel } from '../types';

/**
 * Non-blocking policy check — returns result for route handlers.
 * Future: middleware that calls this and returns 403 when enforce mode is on.
 */
export const checkSourcePolicy = (policyId: string) => {
  const ctx = getRequestContext();
  if (!ctx?.snapshot.trust) {
    return { allowed: true as const };
  }
  return evaluateSourceSecurityPolicy(ctx.snapshot.trust, policyId);
};

/** Placeholder: capability-based route guard. */
export const hasPlatformCapability = (capability: string): boolean => {
  const caps = getRequestContext()?.snapshot.capabilities ?? [];
  return caps.includes(capability as never);
};

export const requireTrustLevel = (minimum: TrustLevel): boolean => {
  const trust = getRequestContext()?.snapshot.trust;
  if (!trust) return false;
  const order = ['BLOCKED', 'SUSPICIOUS', 'UNVERIFIED', 'LIMITED', 'VERIFIED', 'TRUSTED'];
  return order.indexOf(trust.trustLevel) >= order.indexOf(minimum);
};

export type { RequestSource };
