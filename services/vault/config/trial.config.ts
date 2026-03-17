/**
 * Trial period configuration
 *
 * Used when creating accounts and subscriptions to set trial end date in the database.
 * Supports TRIAL_DAYS (default 30) and optional TRIAL_MINUTES for testing (e.g. payment flows in minutes).
 *
 * Env:
 * - TRIAL_DAYS: number of days for trial (default 30). Used when TRIAL_MINUTES is not set.
 * - TRIAL_MINUTES: optional; when set, trial duration is this many minutes (for testing).
 */

const TRIAL_DAYS = Math.max(0, parseInt(process.env.TRIAL_DAYS || '30', 10));
const TRIAL_MINUTES = process.env.TRIAL_MINUTES ? Math.max(0, parseInt(process.env.TRIAL_MINUTES, 10)) : null;

/**
 * Trial duration in milliseconds.
 * If TRIAL_MINUTES is set, use that; otherwise TRIAL_DAYS.
 */
export function getTrialDurationMs(): number {
  if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
    return TRIAL_MINUTES * 60 * 1000;
  }
  return TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Trial duration in seconds (for providers that use seconds, e.g. Razorpay).
 */
export function getTrialDurationSeconds(): number {
  return Math.floor(getTrialDurationMs() / 1000);
}

/**
 * Trial end date from a given start date.
 * Use this when creating subscriptions / setting trial end in the database.
 */
export function getTrialEndDate(from: Date): Date {
  return new Date(from.getTime() + getTrialDurationMs());
}

/**
 * Trial length in days for display and for callers that still pass "days".
 * When using TRIAL_MINUTES, returns equivalent fractional days (e.g. 5 min ≈ 0.0035 days).
 * For subscription creation we prefer getTrialEndDate() so minutes work correctly.
 */
export function getTrialDays(): number {
  if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
    return TRIAL_MINUTES / (24 * 60); // fractional days
  }
  return TRIAL_DAYS;
}

/**
 * Human-readable trial duration for logs (e.g. "30 days" or "5 minutes").
 */
export function getTrialDurationLabel(): string {
  if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
    return `${TRIAL_MINUTES} minute${TRIAL_MINUTES === 1 ? '' : 's'}`;
  }
  return `${TRIAL_DAYS} day${TRIAL_DAYS === 1 ? '' : 's'}`;
}

export const TRIAL_CONFIG = {
  trialDays: TRIAL_DAYS,
  trialMinutes: TRIAL_MINUTES,
  getTrialDurationMs,
  getTrialDurationSeconds,
  getTrialEndDate,
  getTrialDays,
  getTrialDurationLabel,
} as const;
