import type { ClientTrustContext } from '../../trust/types';
import type { RequestContextData, RequestAuthContext } from '../types';
import { toLegacySource } from '../utils/source-parser.util';
import { RequestSource } from '../types/request-source.types';
import { requestContextStorage } from './request-context.storage';
import { RequestContext } from './request-context';

export class RequestContextManager {
  static run<T>(data: RequestContextData, callback: () => T): T {
    return requestContextStorage.run(data, callback);
  }

  static getData(): RequestContextData | undefined {
    return requestContextStorage.getStore();
  }

  static get(): RequestContext | undefined {
    const data = RequestContextManager.getData();
    return data ? new RequestContext(data) : undefined;
  }

  static getOrThrow(): RequestContext {
    const ctx = RequestContextManager.get();
    if (!ctx) {
      throw new Error('RequestContext is not available outside of an active request scope');
    }
    return ctx;
  }

  /** Merge auth/session fields after JWT middleware (does not replace the store). */
  static enrichAuth(partial: Partial<RequestAuthContext> & { userId?: string }): void {
    const data = RequestContextManager.getData();
    if (!data) return;
    if (partial.userId) data.userId = partial.userId;
    data.auth = { ...data.auth, ...partial };
    if (partial.sessionId) data.sessionId = partial.sessionId;
  }

  static enrichUserId(userId: string): void {
    const data = RequestContextManager.getData();
    if (data) data.userId = userId;
  }

  /** Merge trust evaluation results (declared vs verified source). */
  static enrichTrust(trust: ClientTrustContext): void {
    const data = RequestContextManager.getData();
    if (!data) return;
    data.trust = trust;
    data.verifiedSource = trust.verifiedSource;
    if (trust.verifiedSource) {
      data.legacySource = toLegacySource(trust.verifiedSource);
      data.sourceLabel = `[${trust.verifiedSource}]`;
    }
  }

  /** Merge resolved feature flags into request context (mobile-api read path). */
  static enrichFlags(featureFlags: Record<string, boolean>): void {
    const data = RequestContextManager.getData();
    if (!data) return;
    data.flags = { ...data.flags, featureFlags };
  }

  /** Effective source for security decisions: verified when present, else declared. */
  static getEffectiveSource(): RequestSource {
    const data = RequestContextManager.getData();
    if (!data) return RequestSource.Unknown;
    return data.verifiedSource ?? data.declaredSource ?? data.source;
  }
}

export const getRequestContext = (): RequestContext | undefined => RequestContextManager.get();

export const getRequestContextOrThrow = (): RequestContext => RequestContextManager.getOrThrow();
