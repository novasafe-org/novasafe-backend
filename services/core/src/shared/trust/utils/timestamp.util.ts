import { TRUST_DEFAULTS } from '../constants';

export const parseClientTimestamp = (raw: string | undefined): number | null => {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) {
    const num = Number(value);
    return num < 1e12 ? num * 1000 : num;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const isTimestampWithinWindow = (
  timestampMs: number,
  nowMs = Date.now(),
  windowMs = TRUST_DEFAULTS.REPLAY_WINDOW_MS,
): boolean => Math.abs(nowMs - timestampMs) <= windowMs;
