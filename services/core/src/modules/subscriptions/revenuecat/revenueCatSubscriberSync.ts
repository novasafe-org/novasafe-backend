import { fetchRevenueCatSubscriberByAppUserId } from '../services/revenue-cat.service';
import { syncLog } from "./subscriptionLogger";
import {
  defaultSubscriptionState,
  mapRevenueCatSubscriberToState,
} from "./subscriptionStateMapper";
import { findVaultUserById, getPersistedSubscriptionState, persistSubscriptionState } from "./subscriptionRepository";
import type { SubscriptionState } from "./types";

function subscriptionStateFingerprint(state: SubscriptionState): string {
  return `${state.tier}|${state.isActive}|${state.subscriptionStatus}|${state.expiresAt ?? ""}`;
}

export async function refreshSubscriptionStateFromRevenueCat(
  userId: string,
  options?: { lastEventType?: string | null; source?: "webhook" | "api" | "entitlement-check" },
): Promise<SubscriptionState> {
  const user = await findVaultUserById(userId);
  if (!user) {
    syncLog.warn({ userId }, "RevenueCat sync skipped — user not found");
    return defaultSubscriptionState();
  }

  const previous = await getPersistedSubscriptionState(userId);
  const rc = await fetchRevenueCatSubscriberByAppUserId(String(user._id));

  if (!rc?.subscriber) {
    syncLog.info({ userId }, "RevenueCat subscriber empty — persisting free state");
    const free = defaultSubscriptionState();
    await persistSubscriptionState(userId, free);
    return free;
  }

  const next = mapRevenueCatSubscriberToState(rc, {
    lastEventType: options?.lastEventType,
    previousState: previous,
  });

  await persistSubscriptionState(userId, next);

  const previousFingerprint = previous ? subscriptionStateFingerprint(previous) : null;
  const nextFingerprint = subscriptionStateFingerprint(next);
  const stateChanged = previousFingerprint !== nextFingerprint;

  syncLog.info(
    {
      phase: "sync",
      source: options?.source ?? "api",
      userId,
      tier: next.tier,
      isActive: next.isActive,
      subscriptionStatus: next.subscriptionStatus,
      expiresAt: next.expiresAt,
      eventType: options?.lastEventType,
      stateChanged,
      ...(stateChanged && previous
        ? {
            previousTier: previous.tier,
            previousStatus: previous.subscriptionStatus,
            previousIsActive: previous.isActive,
          }
        : {}),
    },
    stateChanged
      ? "RevenueCat subscription state changed"
      : "RevenueCat subscription state synced",
  );

  return next;
}
