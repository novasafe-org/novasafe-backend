import type { SubscriptionEventRecord } from './types';

/** Events stuck in `processing` longer than this may be reclaimed for retry. */
export const STALE_PROCESSING_MS = 5 * 60 * 1000;

export type WebhookClaimOutcome = 'new' | 'duplicate' | 'retry';

export type WebhookEventSnapshot = Pick<
  SubscriptionEventRecord,
  'status' | 'processedAt' | 'createdAt'
>;

/**
 * Pure decision logic for webhook idempotency.
 *
 * - `new`     — no prior record; caller should insert.
 * - `duplicate` — terminal success (completed/ignored) or concurrent in-flight processing.
 * - `retry`   — prior attempt failed or processing claim is stale; safe to reprocess.
 */
export function resolveWebhookClaimOutcome(
  existing: WebhookEventSnapshot | null,
  nowMs = Date.now(),
): WebhookClaimOutcome {
  if (!existing) return 'new';

  if (existing.status === 'completed' || existing.status === 'ignored') {
    return 'duplicate';
  }

  if (existing.status === 'failed') {
    return 'retry';
  }

  if (existing.status === 'processing') {
    const anchor = existing.processedAt || existing.createdAt;
    const ageMs = nowMs - new Date(anchor).getTime();
    if (ageMs >= STALE_PROCESSING_MS) return 'retry';
    return 'duplicate';
  }

  return 'duplicate';
}

/** Terminal statuses must never be reprocessed. */
export function isTerminalWebhookStatus(status: SubscriptionEventRecord['status']): boolean {
  return status === 'completed' || status === 'ignored';
}
