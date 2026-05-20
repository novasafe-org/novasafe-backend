import { fetchRevenueCatSubscriberByAppUserId } from "../services/revenueCatService";
import { syncLog } from "./subscriptionLogger";
import {
  defaultSubscriptionState,
  mapRevenueCatSubscriberToState,
} from "./subscriptionStateMapper";
import { findVaultUserById, getPersistedSubscriptionState, persistSubscriptionState } from "./subscriptionRepository";
import type { SubscriptionState } from "./types";

export async function refreshSubscriptionStateFromRevenueCat(
  userId: string,
  options?: { lastEventType?: string | null },
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
  syncLog.info(
    {
      userId,
      tier: next.tier,
      isActive: next.isActive,
      subscriptionStatus: next.subscriptionStatus,
      expiresAt: next.expiresAt,
      eventType: options?.lastEventType,
    },
    "RevenueCat subscription state synced",
  );

  return next;
}
