import { AsyncLocalStorage } from 'async_hooks';
import { RequestContextManager } from '../../request-context/context/request-context.manager';
import type { LogMeta, RequestLogContext } from './logger.types';

export interface RequestContextStore {
  requestId: string;
  correlationId?: string;
  context?: string;
  meta?: LogMeta;
  request?: Partial<RequestLogContext>;
}

/**
 * Request-scoped context for correlation IDs and child loggers.
 * Ready for distributed tracing extensions.
 */
export class LoggerContext {
  private static readonly storage = new AsyncLocalStorage<RequestContextStore>();

  static run<T>(store: RequestContextStore, callback: () => T): T {
    return LoggerContext.storage.run(store, callback);
  }

  static get(): RequestContextStore | undefined {
    return LoggerContext.storage.getStore();
  }

  static getRequestId(): string | undefined {
    return LoggerContext.get()?.requestId;
  }

  static getCorrelationId(): string | undefined {
    return LoggerContext.get()?.correlationId;
  }

  static mergeMeta(meta: LogMeta = {}): LogMeta {
    const store = LoggerContext.get();
    const platformCtx = RequestContextManager.get();
    const platformMeta = platformCtx?.toLogMeta() ?? {};

    if (!store && !platformCtx) return meta;

    return {
      requestId: store?.requestId ?? (platformMeta.requestId as string | undefined),
      correlationId: store?.correlationId ?? (platformMeta.correlationId as string | undefined),
      context: store?.context ?? (platformMeta.sourceLabel as string | undefined),
      traceId: platformMeta.traceId as string | undefined,
      declaredSource: platformMeta.declaredSource as string | undefined,
      verifiedSource: platformMeta.verifiedSource as string | undefined,
      source: platformMeta.source as string | undefined,
      sourceLabel: platformMeta.sourceLabel as string | undefined,
      platform: platformMeta.platform as string | undefined,
      legacySource: platformMeta.legacySource as string | undefined,
      trustLevel: platformMeta.trustLevel as string | undefined,
      verificationStatus: platformMeta.verificationStatus as string | undefined,
      riskScore: platformMeta.riskScore as number | undefined,
      userId: platformMeta.userId as string | undefined,
      sessionId: platformMeta.sessionId as string | undefined,
      ...store?.meta,
      ...meta,
    };
  }
}
