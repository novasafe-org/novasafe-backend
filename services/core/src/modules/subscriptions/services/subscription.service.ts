import { ObjectId } from "../../../database/object-id";
import { COLLECTIONS } from "../../../database/collections";
import type { EntitlementKey } from "../config/subscription.config";
import { SUBSCRIPTION_CONFIG } from "../config/subscription.config";
import { getNativeMongo } from "../../../database/adapters/native-mongo.adapter";
import { fetchRevenueCatOfferings } from './revenue-cat.service';
import { ensureSubscriptionIndexes } from "../revenuecat/subscriptionRepository";
import { refreshSubscriptionStateFromRevenueCat } from "../revenuecat/revenueCatSubscriberSync";
import { isWebhookSecretConfigured } from "../revenuecat/revenueCatWebhookAuth";
import {
  defaultSubscriptionState,
  hasEntitlement,
  isLapsedProReadOnly,
  isProFromState,
  isWithinPostExpiryGrace,
  POST_EXPIRY_GRACE_MS,
  withAppFreeOverride,
  withTierEntitlements,
} from "../revenuecat/subscriptionStateMapper";
import {
  findVaultUserById,
  getPersistedSubscriptionState,
  listPurchaseHistoryForUser,
  listSubscriptionEventsForUser,
} from "../revenuecat/subscriptionRepository";
import type { SubscriptionState } from "../revenuecat/types";
import { logger } from "../../../shared/logger";
import {
  ShareRecipientStatus,
  ShareStatus,
} from "../../../database/schemas/sharing";

export type { SubscriptionState } from "../revenuecat/types";

const db = getNativeMongo();

export { ensureSubscriptionIndexes };
export { processRevenueCatWebhook } from "../revenuecat/revenueCatWebhookProcessor";
export { isLapsedProReadOnly, isProFromState, isWithinPostExpiryGrace };

async function isUserAppFreeOverride(userId: string): Promise<boolean> {
  const user = await findVaultUserById(userId);
  return Boolean(user && (user as { appFreeOverride?: boolean }).appFreeOverride === true);
}

/**
 * Merge vaultUsers.appFreeOverride into a resolved subscription state (read-time only).
 * Ensures maxDocuments / maxVaultItems are always present for older persisted states.
 */
export async function applyAppFreeOverrideForUser(
  userId: string,
  state: SubscriptionState,
): Promise<SubscriptionState> {
  if (await isUserAppFreeOverride(userId)) {
    return withAppFreeOverride(state);
  }
  const limits = state.limits ?? {
    maxVaultItems: SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems,
    maxPasswords: SUBSCRIPTION_CONFIG.freeLimits.maxPasswords,
    maxSecureNotes: SUBSCRIPTION_CONFIG.freeLimits.maxSecureNotes,
    maxDevices: SUBSCRIPTION_CONFIG.freeLimits.maxDevices,
    maxDocuments: SUBSCRIPTION_CONFIG.freeLimits.maxDocuments,
  };
  const next: SubscriptionState = {
    ...state,
    appFreeOverride: false,
    limits: {
      ...limits,
      maxVaultItems:
        limits.maxVaultItems ??
        (state.isPro
          ? Number.MAX_SAFE_INTEGER
          : SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems),
      maxDocuments:
        limits.maxDocuments ??
        (state.isPro
          ? Number.MAX_SAFE_INTEGER
          : SUBSCRIPTION_CONFIG.freeLimits.maxDocuments),
    },
  };
  next.isReadOnly = isLapsedProReadOnly(next);
  return next;
}

export async function getSubscriptionStateForUser(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<SubscriptionState> {
  const base = options?.forceRefresh
    ? await refreshSubscriptionStateFromRevenueCat(userId)
    : await getPersistedSubscriptionStateForUser(userId);
  return applyAppFreeOverrideForUser(userId, base);
}

export async function getPersistedSubscriptionStateForUser(userId: string): Promise<SubscriptionState> {
  const stored = await getPersistedSubscriptionState(userId);
  const current = stored ? { ...defaultSubscriptionState(), ...stored } : defaultSubscriptionState();
  const tier = isProFromState(current) ? "pro" : "free";
  return withTierEntitlements({ ...current, updatedAt: new Date().toISOString() }, tier);
}

export { hasEntitlement };

const entitlementDeniedMessage = (entitlement: EntitlementKey): string => {
  const messages: Record<EntitlementKey, string> = {
    canUseCloudSync: "Cloud sync requires NovaSafe Pro",
    canUseCSVImportExport: "CSV import/export requires NovaSafe Pro",
    canUseUnlimitedPasswords: "Unlimited passwords require NovaSafe Pro",
    canUseUnlimitedNotes: "Unlimited notes require NovaSafe Pro",
    canUseUnlimitedVaultItems: "Unlimited vault items require NovaSafe Pro",
    canUseFolders: "Folders require NovaSafe Pro",
    canUseAuthenticator: "Authenticator requires NovaSafe Pro",
    canUseAttachments: "Attachments require NovaSafe Pro",

    canShareItems: "Sharing requires NovaSafe Pro",
    canUsePasswordHistory: "Password history requires NovaSafe Pro",
    canUseAdvancedSecurity: "Advanced security analytics require NovaSafe Pro",
    canUseMultiDevice: "Multiple devices require NovaSafe Pro",
  };
  return messages[entitlement];
};

export type AssertResult =
  | { ok: true; state: SubscriptionState }
  | { ok: false; message: string; state: SubscriptionState; code?: string };

const fail = (state: SubscriptionState, message: string, code?: string): AssertResult => ({
  ok: false,
  message,
  state,
  code,
});

const ok = (state: SubscriptionState): AssertResult => ({ ok: true, state });

export async function assertEntitlement(
  userId: string,
  entitlement: EntitlementKey,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; state: SubscriptionState; message: string }> {
  const state = await getSubscriptionStateForUser(userId);
  if (hasEntitlement(state, entitlement)) return { ok: true, state };
  return { ok: false, state, message: entitlementDeniedMessage(entitlement) };
}

/**
 * Re-check entitlement after a live RevenueCat sync (e.g. user just purchased Pro in-app).
 */
export async function assertEntitlementWithRefresh(
  userId: string,
  entitlement: EntitlementKey,
): Promise<{ ok: true; state: SubscriptionState } | { ok: false; state: SubscriptionState; message: string }> {
  const first = await assertEntitlement(userId, entitlement);
  if (first.ok) return first;

  try {
    const refreshed = await refreshSubscriptionStateFromRevenueCat(userId);
    const state = await applyAppFreeOverrideForUser(userId, refreshed);
    if (hasEntitlement(state, entitlement)) {
      return { ok: true, state };
    }
    return { ok: false, state, message: entitlementDeniedMessage(entitlement) };
  } catch {
    return first;
  }
}

/** Lapsed Pro: block create/edit; allow view. */
export async function assertCanModifyVault(userId: string): Promise<AssertResult> {
  const state = await getSubscriptionStateForUser(userId);
  if (state.appFreeOverride) return ok(state);
  if (isLapsedProReadOnly(state)) {
    return fail(
      state,
      "Your Pro subscription has ended. Upgrade to Pro to create or edit vault items.",
      "NOVASAFE_SUBSCRIPTION_READ_ONLY",
    );
  }
  return ok(state);
}

/**
 * Free shared budget: active vault items + authenticator entries (standalone or linked).
 * Pro / override: unlimited. Used by vault-item and authenticator create guards.
 */
export async function countFreePlanSlots(userId: string): Promise<{
  vaultItemCount: number;
  authenticatorCount: number;
  usedSlots: number;
}> {
  if (!ObjectId.isValid(userId)) {
    return { vaultItemCount: 0, authenticatorCount: 0, usedSlots: 0 };
  }
  const oid = new ObjectId(userId);
  const [vaultItemCount, authenticatorCount] = await Promise.all([
    db.getDb().collection(COLLECTIONS.vaultItems).countDocuments({
      userId: oid,
      deleted: { $ne: true },
      deleted_at: null,
    }),
    db.getDb().collection(COLLECTIONS.authenticatorEntries).countDocuments({
      userId: oid,
      deleted: { $ne: true },
      deleted_at: null,
    }),
  ]);
  return {
    vaultItemCount,
    authenticatorCount,
    usedSlots: vaultItemCount + authenticatorCount,
  };
}

const freeSlotCapMessage = (maxItems: number): string =>
  `Free plan supports up to ${maxItems} items total (vault items and authenticators combined). Upgrade to Pro for unlimited.`;

/**
 * Free: hard cap of maxVaultItems (default 3) across vault items + authenticators.
 * Pro: unlimited. Lapsed Pro: blocked via read-only.
 *
 * When `consumeAuthenticatorSlot` is true (create item + new TOTP together),
 * reserves 2 slots before anything is saved.
 */
export async function assertCanCreateVaultItem(
  userId: string,
  _category?: string,
  options?: { consumeAuthenticatorSlot?: boolean },
): Promise<{ ok: true } | { ok: false; message: string; state: SubscriptionState; code?: string }> {
  const state = await getSubscriptionStateForUser(userId);
  if (state.appFreeOverride) return { ok: true };

  if (isLapsedProReadOnly(state)) {
    return {
      ok: false,
      message: "Your Pro subscription has ended. Upgrade to Pro to create vault items.",
      state,
      code: "NOVASAFE_SUBSCRIPTION_READ_ONLY",
    };
  }

  if (
    state.isPro ||
    hasEntitlement(state, "canUseUnlimitedVaultItems") ||
    isWithinPostExpiryGrace(state)
  ) {
    return { ok: true };
  }

  const maxItems = state.limits.maxVaultItems ?? SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems;
  const { usedSlots } = await countFreePlanSlots(userId);
  const slotsNeeded = 1 + (options?.consumeAuthenticatorSlot ? 1 : 0);

  if (usedSlots + slotsNeeded > maxItems) {
    return {
      ok: false,
      message: options?.consumeAuthenticatorSlot
        ? `Free plan limit reached: item and authenticator together need ${slotsNeeded} slots, but only ${Math.max(0, maxItems - usedSlots)} remain (cap ${maxItems}).`
        : freeSlotCapMessage(maxItems),
      state,
      code: "NOVASAFE_SUBSCRIPTION_REQUIRED",
    };
  }
  return { ok: true };
}

export async function assertCanCreateFolder(userId: string): Promise<AssertResult> {
  const write = await assertCanModifyVault(userId);
  if (!write.ok) return write;
  if (write.state.appFreeOverride || write.state.isPro || hasEntitlement(write.state, "canUseFolders")) {
    return write;
  }
  return fail(write.state, "Folders require NovaSafe Pro. Upgrade to organize items into folders.", "NOVASAFE_SUBSCRIPTION_REQUIRED");
}

/**
 * Free: authenticators allowed within the shared vault+authenticator slot cap (default 3).
 * Counts standalone and item-linked authenticators the same.
 * Pro: unlimited. Lapsed Pro: blocked via read-only.
 */
export async function assertCanCreateAuthenticator(userId: string): Promise<AssertResult> {
  const write = await assertCanModifyVault(userId);
  if (write.ok === false) return write;
  const state = write.state;

  if (
    state.appFreeOverride ||
    state.isPro ||
    hasEntitlement(state, "canUseUnlimitedVaultItems") ||
    isWithinPostExpiryGrace(state)
  ) {
    return ok(state);
  }

  const maxItems = state.limits.maxVaultItems ?? SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems;
  const { usedSlots } = await countFreePlanSlots(userId);
  if (usedSlots >= maxItems) {
    return fail(state, freeSlotCapMessage(maxItems), "NOVASAFE_SUBSCRIPTION_REQUIRED");
  }
  return ok(state);
}

export async function assertCanAddAttachment(userId: string): Promise<AssertResult> {
  const write = await assertCanModifyVault(userId);
  if (!write.ok) return write;
  if (
    write.state.appFreeOverride ||
    write.state.isPro ||
    hasEntitlement(write.state, "canUseAttachments")
  ) {
    return write;
  }
  return fail(
    write.state,
    "Attachments require NovaSafe Pro. Upgrade to attach files to vault items.",
    "NOVASAFE_SUBSCRIPTION_REQUIRED",
  );
}

/**
 * Documents are Pro-only (Free: zero documents).
 */
export async function assertCanUploadDocument(
  userId: string,
): Promise<
  | { ok: true; state: SubscriptionState }
  | { ok: false; message: string; state: SubscriptionState; code?: string }
> {
  const state = await getSubscriptionStateForUser(userId);
  if (state.appFreeOverride || state.isPro) {
    return { ok: true, state };
  }
  if (isLapsedProReadOnly(state)) {
    return {
      ok: false,
      message: "Your Pro subscription has ended. Upgrade to Pro to upload documents.",
      state,
      code: "NOVASAFE_SUBSCRIPTION_READ_ONLY",
    };
  }
  return {
    ok: false,
    message: "Documents require NovaSafe Pro. Upgrade to store files securely.",
    state,
    code: "NOVASAFE_SUBSCRIPTION_REQUIRED",
  };
}

const activeRecipientStatuses = [ShareRecipientStatus.Pending, ShareRecipientStatus.Active];
const activeShareStatuses = [ShareStatus.Active];

async function countActiveSharesFromSenderToRecipient(
  senderId: string,
  recipientUserId: string,
): Promise<number> {
  if (!ObjectId.isValid(senderId) || !ObjectId.isValid(recipientUserId)) return 0;
  const rows = await db
    .getDb()
    .collection(COLLECTIONS.shareRecords)
    .aggregate([
      {
        $match: {
          senderId: new ObjectId(senderId),
          deleted: { $ne: true },
          status: { $in: activeShareStatuses },
          recipients: {
            $elemMatch: {
              userId: new ObjectId(recipientUserId),
              status: { $in: activeRecipientStatuses },
            },
          },
        },
      },
      { $group: { _id: "$resourceId" } },
      { $count: "total" },
    ])
    .toArray();
  return Number(rows[0]?.total || 0);
}

async function countIncomingActiveShares(recipientUserId: string): Promise<number> {
  if (!ObjectId.isValid(recipientUserId)) return 0;
  const rows = await db
    .getDb()
    .collection(COLLECTIONS.shareRecords)
    .aggregate([
      {
        $match: {
          deleted: { $ne: true },
          status: { $in: activeShareStatuses },
          recipients: {
            $elemMatch: {
              userId: new ObjectId(recipientUserId),
              status: { $in: activeRecipientStatuses },
            },
          },
        },
      },
      { $group: { _id: "$resourceId" } },
      { $count: "total" },
    ])
    .toArray();
  return Number(rows[0]?.total || 0);
}

async function countSharesCreatedLastHour(senderId: string): Promise<number> {
  if (!ObjectId.isValid(senderId)) return 0;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return db.getDb().collection(COLLECTIONS.shareRecords).countDocuments({
    senderId: new ObjectId(senderId),
    createdAt: { $gte: since },
  });
}

/** Log when one Pro concentrates shares on the same few Free accounts. */
export async function logProFreeShareConcentration(senderId: string): Promise<void> {
  if (!ObjectId.isValid(senderId)) return;
  const { concentrationRecipientThreshold, concentrationShareThreshold } =
    SUBSCRIPTION_CONFIG.sharingLimits;

  const rows = await db
    .getDb()
    .collection(COLLECTIONS.shareRecords)
    .aggregate([
      {
        $match: {
          senderId: new ObjectId(senderId),
          deleted: { $ne: true },
          status: { $in: activeShareStatuses },
        },
      },
      { $unwind: "$recipients" },
      {
        $match: {
          "recipients.userId": { $ne: null },
          "recipients.status": { $in: activeRecipientStatuses },
        },
      },
      {
        $group: {
          _id: "$recipients.userId",
          shareCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  if (rows.length === 0 || rows.length > concentrationRecipientThreshold) return;
  const totalShares = rows.reduce((sum, r) => sum + Number(r.shareCount || 0), 0);
  if (totalShares < concentrationShareThreshold) return;

  logger.warn("Pro share concentration: one Pro sharing heavily with a few free accounts", {
    senderId,
    uniqueFreeRecipients: rows.length,
    totalActiveRecipientRows: totalShares,
    recipientUserIds: rows.map((r) => String(r._id)),
  });
}

/**
 * Sender must be Pro (or override). Enforces rate limit + Pro→Free pair / Free incoming caps.
 * `additionalItems` is how many new distinct items this invite would add (default 1).
 */
export async function assertCanShareWithRecipients(
  senderId: string,
  recipientUserIds: Array<string | null | undefined>,
  options?: { additionalItems?: number },
): Promise<AssertResult> {
  const additionalItems = Math.max(1, Number(options?.additionalItems || 1));
  const state = await getSubscriptionStateForUser(senderId);
  if (state.appFreeOverride) {
    // still enforce rate + recipient free caps
  } else if (isLapsedProReadOnly(state)) {
    return fail(
      state,
      "Your Pro subscription has ended. Upgrade to Pro to share items.",
      "NOVASAFE_SUBSCRIPTION_READ_ONLY",
    );
  } else if (!state.isPro && !hasEntitlement(state, "canShareItems")) {
    return fail(
      state,
      "Sharing requires NovaSafe Pro. Upgrade to share vault items.",
      "NOVASAFE_SUBSCRIPTION_REQUIRED",
    );
  }

  const maxPerHour = SUBSCRIPTION_CONFIG.sharingLimits.maxSharesPerHour;
  const recent = await countSharesCreatedLastHour(senderId);
  if (recent + additionalItems > maxPerHour) {
    return fail(
      state,
      "Share rate limit reached. Try again later.",
      "SHARE_RATE_LIMITED",
    );
  }

  const maxPair = SUBSCRIPTION_CONFIG.sharingLimits.maxItemsProToSameFree;
  const maxIncoming = SUBSCRIPTION_CONFIG.sharingLimits.maxIncomingSharesFree;

  for (const rawId of recipientUserIds) {
    const recipientId = rawId ? String(rawId) : "";
    if (!recipientId || !ObjectId.isValid(recipientId)) continue;

    const recipientState = await getSubscriptionStateForUser(recipientId);
    if (recipientState.appFreeOverride || recipientState.isPro) continue;

    const pairCount = await countActiveSharesFromSenderToRecipient(senderId, recipientId);
    if (pairCount + additionalItems > maxPair) {
      return fail(
        state,
        // Wording matches product copy agreed for mobile share errors.
        `this person is on the free plan and already has ${maxPair} shared items from you.`,
        "SHARE_FREE_RECIPIENT_CAP",
      );
    }

    // Across ALL Pro senders combined (not only this owner).
    const incoming = await countIncomingActiveShares(recipientId);
    if (incoming + additionalItems > maxIncoming) {
      return fail(
        state,
        `this person is on the free plan and already has ${maxIncoming} shared items.`,
        "SHARE_FREE_INCOMING_CAP",
      );
    }
  }

  return ok(state);
}

export type PlanPromptInfo = {
  /** Display name for mobile: "NovaSafe Free" | "NovaSafe Pro". */
  planName: string;
  tier: "free" | "pro";
  isPro: boolean;
  isReadOnly: boolean;
  /** Soft 7-day window after Pro expiry — writes allowed; show renewal UI. */
  inPostExpiryGrace: boolean;
  postExpiryGraceEndsAt: string | null;
  appFreeOverride: boolean;
  vaultItemCount: number;
  authenticatorCount: number;
  /** vaultItemCount + authenticatorCount (shared Free budget). */
  usedSlots: number;
  vaultItemLimit: number | null;
  canCreateVaultItems: boolean;
  canCreateAuthenticators: boolean;
  features: {
    folders: boolean;
    authenticator: boolean;
    attachments: boolean;
    sharing: boolean;
    unlimitedVaultItems: boolean;
  };
  upgradeRequiredFor: string[];
  upgradeMessage: string | null;
  subscriptionStatus: string;
  expiresAt: string | null;
};

/** Compact plan payload for mobile upgrade prompts. */
export async function getPlanPromptForUser(userId: string): Promise<PlanPromptInfo> {
  const state = await getSubscriptionStateForUser(userId);
  const { vaultItemCount, authenticatorCount, usedSlots } = await countFreePlanSlots(userId);

  const unlimited = Boolean(
    state.appFreeOverride || state.isPro || hasEntitlement(state, "canUseUnlimitedVaultItems"),
  );
  const limit = unlimited
    ? null
    : state.limits.maxVaultItems ?? SUBSCRIPTION_CONFIG.freeLimits.maxVaultItems;
  const inPostExpiryGrace = isWithinPostExpiryGrace(state);
  const isReadOnly = Boolean(state.isReadOnly || isLapsedProReadOnly(state));
  const underCap = unlimited || inPostExpiryGrace || (limit != null && usedSlots < limit);
  const canCreateVaultItems = !isReadOnly && underCap;
  const canCreateAuthenticators = !isReadOnly && underCap;
  let postExpiryGraceEndsAt: string | null = null;
  if (inPostExpiryGrace && state.expiresAt) {
    const exp = new Date(state.expiresAt).getTime();
    if (!Number.isNaN(exp)) {
      postExpiryGraceEndsAt = new Date(exp + POST_EXPIRY_GRACE_MS).toISOString();
    }
  }

  const features = {
    folders: Boolean(state.appFreeOverride || state.isPro || hasEntitlement(state, "canUseFolders")),
    authenticator: Boolean(
      state.appFreeOverride ||
        state.isPro ||
        hasEntitlement(state, "canUseAuthenticator"),
    ),
    attachments: Boolean(
      state.appFreeOverride || state.isPro || hasEntitlement(state, "canUseAttachments"),
    ),
    sharing: Boolean(state.appFreeOverride || state.isPro || hasEntitlement(state, "canShareItems")),
    unlimitedVaultItems: unlimited,
  };

  const upgradeRequiredFor: string[] = [];
  if (!features.unlimitedVaultItems) upgradeRequiredFor.push("unlimited_vault_items");
  if (!features.folders) upgradeRequiredFor.push("folders");
  if (!features.attachments) upgradeRequiredFor.push("attachments");
  if (!features.sharing) upgradeRequiredFor.push("sharing");
  if (isReadOnly) upgradeRequiredFor.push("restore_write_access");

  let upgradeMessage: string | null = null;
  if (isReadOnly) {
    upgradeMessage = "Your Pro subscription has ended. Upgrade to restore create and edit access.";
  } else if (!unlimited && limit != null && usedSlots >= limit) {
    upgradeMessage = freeSlotCapMessage(limit);
  } else if (upgradeRequiredFor.length > 0 && !state.isPro) {
    upgradeMessage = "Upgrade to NovaSafe Pro for folders, attachments, and sharing.";
  }

  if (inPostExpiryGrace && !upgradeMessage) {
    upgradeMessage = "Your Pro plan expired. Renew within 7 days to keep creating and editing.";
  }

  return {
    planName:
      state.appFreeOverride || state.isPro
        ? "NovaSafe Pro"
        : inPostExpiryGrace
          ? "NovaSafe Pro (expired)"
          : "NovaSafe Free",
    tier: state.tier,
    isPro: Boolean(state.isPro || state.appFreeOverride),
    isReadOnly,
    inPostExpiryGrace,
    postExpiryGraceEndsAt,
    appFreeOverride: Boolean(state.appFreeOverride),
    vaultItemCount,
    authenticatorCount,
    usedSlots,
    vaultItemLimit: limit,
    canCreateVaultItems,
    canCreateAuthenticators,
    features,
    upgradeRequiredFor,
    upgradeMessage,
    subscriptionStatus: state.subscriptionStatus,
    expiresAt: state.expiresAt,
  };
}

export async function getSubscriptionOfferings() {
  const rc = await fetchRevenueCatOfferings();
  if (!rc) {
    return {
      currentOfferingId: SUBSCRIPTION_CONFIG.offeringDefault,
      offerings: [],
    };
  }
  return {
    currentOfferingId: rc.current_offering_id || SUBSCRIPTION_CONFIG.offeringDefault,
    offerings: rc.offerings || [],
  };
}

export async function syncPurchaseForUser(userId: string): Promise<SubscriptionState> {
  const refreshed = await refreshSubscriptionStateFromRevenueCat(userId);
  return applyAppFreeOverrideForUser(userId, refreshed);
}

export async function getSubscriptionDebugSnapshot(userId: string): Promise<{
  currentState: SubscriptionState;
  storedState: SubscriptionState;
  lastWebhookEvent: {
    eventId: string;
    eventType: string;
    processedAt: string | null;
    status?: string;
  } | null;
  recentEvents: Array<{
    eventId: string;
    eventType: string;
    processedAt: string | null;
    status?: string;
  }>;
  metadata: {
    revenueCatConfigured: boolean;
    revenueCatProjectIdPresent: boolean;
    webhookSecretConfigured: boolean;
    entitlementPro: string;
    generatedAt: string;
  };
}> {
  const [storedRaw, currentRaw, events] = await Promise.all([
    getPersistedSubscriptionStateForUser(userId),
    refreshSubscriptionStateFromRevenueCat(userId),
    listSubscriptionEventsForUser(userId, 10),
  ]);
  const [storedState, currentState] = await Promise.all([
    applyAppFreeOverrideForUser(userId, storedRaw),
    applyAppFreeOverrideForUser(userId, currentRaw),
  ]);

  return {
    currentState,
    storedState,
    lastWebhookEvent: events[0] || null,
    recentEvents: events,
    metadata: {
      revenueCatConfigured: Boolean(SUBSCRIPTION_CONFIG.apiKey),
      revenueCatProjectIdPresent: Boolean(SUBSCRIPTION_CONFIG.projectId),
      webhookSecretConfigured: isWebhookSecretConfigured(),
      entitlementPro: SUBSCRIPTION_CONFIG.entitlementPro,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function getMembershipOverviewForUser(userId: string): Promise<{
  subscription: SubscriptionState;
  plan: PlanPromptInfo;
  recentActivity: Array<{ eventType: string; processedAt: string | null; status?: string }>;
  purchases: Array<{
    eventId: string;
    eventType: string;
    productId: string | null;
    transactionId: string | null;
    store: string | null;
    environment: string | null;
    purchasedAt: string | null;
  }>;
}> {
  const [subscription, plan, recentActivity, purchases] = await Promise.all([
    getSubscriptionStateForUser(userId, { forceRefresh: false }),
    getPlanPromptForUser(userId),
    listSubscriptionEventsForUser(userId, 25),
    listPurchaseHistoryForUser(userId, 25),
  ]);
  return {
    subscription,
    plan,
    recentActivity: recentActivity.map((e) => ({
      eventType: e.eventType,
      processedAt: e.processedAt,
      status: e.status,
    })),
    purchases,
  };
}

export async function getPurchaseHistoryForUser(userId: string, limit = 25) {
  return listPurchaseHistoryForUser(userId, limit);
}
