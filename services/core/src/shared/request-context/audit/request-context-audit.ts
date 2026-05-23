import { getRequestContext } from '../context';

/**
 * Returns audit document fields from the active request context.
 * Use when writing audit logs, security events, or analytics payloads.
 */
export const getRequestContextAuditFields = (): Record<string, unknown> => {
  const ctx = getRequestContext();
  return ctx ? ctx.toAuditFields() : {};
};
