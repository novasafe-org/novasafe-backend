import { getRequestContext } from '../../request-context';

/** Audit document trust fields from active request context. */
export const getTrustAuditFields = (): Record<string, unknown> => {
  const ctx = getRequestContext();
  if (!ctx) return {};
  return ctx.toAuditFields();
};
