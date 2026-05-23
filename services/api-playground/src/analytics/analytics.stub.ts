/**
 * Placeholder for future API analytics (usage, latency, error rates).
 */
export interface AnalyticsEvent {
  type: 'request' | 'auth' | 'replay' | 'export';
  timestamp: string;
  meta?: Record<string, unknown>;
}

export const recordAnalyticsEvent = (_event: AnalyticsEvent): void => {
  // No-op until analytics pipeline is wired
};
