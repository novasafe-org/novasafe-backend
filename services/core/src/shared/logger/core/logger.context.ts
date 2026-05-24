import { AsyncLocalStorage } from 'async_hooks';
import { RequestContextManager } from '../../request-context/context/request-context.manager';
import {
  pickLogFields,
  resolveLogContextFields,
  type LogContextFieldKey,
} from '../config/log-context-fields.config';
import type { LogMeta, RequestLogContext } from './logger.types';

export interface RequestContextStore {
  requestId: string;
  correlationId?: string;
  context?: string;
  meta?: LogMeta;
  request?: Partial<RequestLogContext>;
}

/** Build full context payload before field filtering. */
const buildFullContextMeta = (): LogMeta => {
  const store = LoggerContext.get();
  const platformCtx = RequestContextManager.get();
  const platformMeta = platformCtx?.toLogMeta() ?? {};

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
    deviceId: platformMeta.deviceId as string | undefined,
    appVersion: platformMeta.appVersion as string | undefined,
    buildVersion: platformMeta.buildVersion as string | undefined,
    apiVersion: platformMeta.apiVersion as string | undefined,
    tenantId: platformMeta.tenantId as string | undefined,
    region: platformMeta.region as string | undefined,
    ...store?.meta,
  };
};

let contextFieldKeys: LogContextFieldKey[] | null = null;

const getContextFieldKeys = (): LogContextFieldKey[] => {
  if (!contextFieldKeys) {
    contextFieldKeys = resolveLogContextFields();
  }
  return contextFieldKeys;
};

/** Re-resolve when config is reloaded (tests). */
export const resetLogContextFieldCache = (): void => {
  contextFieldKeys = null;
};

/**
 * Request-scoped context for correlation IDs and child loggers.
 * Fields included in every log are controlled by LOG_CONTEXT_FIELDS.
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
    if (!store && !platformCtx && Object.keys(meta).length === 0) {
      return meta;
    }

    const full = { ...buildFullContextMeta(), ...meta };
    return pickLogFields(full, getContextFieldKeys()) as LogMeta;
  }
}
