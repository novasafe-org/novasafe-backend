/** URL-safe incident slug with month suffix for uniqueness. */
export const buildIncidentSlug = (title: string, at = new Date()): string => {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const month = at.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const year = at.getFullYear();
  return `${base || 'incident'}-${month}-${year}`;
};

export const normalizeServiceKey = (key: string): string =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const formatDateKey = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

export const endOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

export const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/** First day public status monitoring is shown (YYYY-MM-DD, UTC). */
export const STATUS_MONITORING_START_DATE =
  process.env.STATUS_MONITORING_START_DATE?.trim() || '2026-06-20';

export const getMonitoringStartDate = (): Date =>
  startOfUtcDay(new Date(`${STATUS_MONITORING_START_DATE}T00:00:00.000Z`));

export const isBeforeMonitoringStart = (dateKey: string): boolean =>
  dateKey < STATUS_MONITORING_START_DATE;
