/**
 * Status page admin authentication — Bearer token matching STATUS_PAGE_ADMIN_SECRET.
 * Falls back to authenticated JWT when secret is not configured (development only).
 */

export const STATUS_PAGE_CONFIG = {
  adminSecret: String(process.env.STATUS_PAGE_ADMIN_SECRET || '').trim(),
  defaultServiceKey: 'api',
} as const;

export const isStatusPageAdminSecretConfigured = (): boolean =>
  Boolean(STATUS_PAGE_CONFIG.adminSecret);
