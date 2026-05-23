import type { HttpIncomingMessage } from '../../request-context/types';
import { RequestContextManager } from '../../request-context/context';
import { trustConfig } from '../config/trust.config';
import { TrustLevel } from '../types';
import { getTrustEvaluator } from '../verification/trust-evaluator.service';

/**
 * Runs trust evaluation and merges into active RequestContext (framework-agnostic entry).
 */
export const runTrustVerification = async (message: HttpIncomingMessage): Promise<void> => {
  const data = RequestContextManager.getData();
  if (!data || !trustConfig.enabled) return;

  const trust = await getTrustEvaluator().evaluate({
    message,
    declaredSource: data.declaredSource ?? data.source,
    platform: data.platform,
    appVersion: data.appVersion,
    buildVersion: data.buildVersion,
    deviceId: data.deviceId,
    requestId: data.requestId,
    path: data.path,
    method: data.method,
  });

  RequestContextManager.enrichTrust(trust);

  if (trustConfig.enforceBlocking && trust.trustLevel === TrustLevel.Blocked) {
    throw new TrustBlockedError(trust);
  }
};

export class TrustBlockedError extends Error {
  constructor(public readonly trust: import('../types').ClientTrustContext) {
    super('Request blocked by trust policy');
    this.name = 'TrustBlockedError';
  }
}
