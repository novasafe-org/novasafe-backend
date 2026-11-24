export const SUBSCRIPTION_CONFIG = {
  provider: "revenuecat",
  webhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET || "",
  /** RevenueCat **Secret** API key (Project settings → API keys). Do not use goog_/appl_ public SDK keys here. */
  apiKey:
    process.env.REVENUECAT_SECRET_API_KEY ||
    process.env.REVENUECAT_API_KEY ||
    "",
  projectId: process.env.REVENUECAT_PROJECT_ID || "",
  apiBaseUrl: process.env.REVENUECAT_API_BASE_URL || "https://api.revenuecat.com/v1",
  /** Must match the entitlement identifier in RevenueCat (your project uses `pro`). */
  entitlementPro: process.env.REVENUECAT_ENTITLEMENT_PRO || "pro",
  offeringDefault:
    process.env.REVENUECAT_DEFAULT_OFFERING_ID || "default",
  freeLimits: {
    /** Unified Free vault item hard cap (logins + notes + other categories). */
    maxVaultItems: Number(process.env.FREE_PLAN_MAX_VAULT_ITEMS || 3),
    /** Kept for API/clients; create path uses maxVaultItems. */
    maxPasswords: Number(process.env.FREE_PLAN_MAX_PASSWORDS || 3),
    maxSecureNotes: Number(process.env.FREE_PLAN_MAX_SECURE_NOTES || 3),
    maxDevices: Number(process.env.FREE_PLAN_MAX_DEVICES || 1),
    /**
     * Documents are Pro-only (`assertCanUploadDocument`). Keep 0 so clients/plan
     * payloads do not imply Free still has a 3-document budget.
     */
    maxDocuments: Number(process.env.FREE_PLAN_MAX_DOCUMENTS || 0),
  },
  sharingLimits: {
    /** Max recipients on a single share invite. */
    maxRecipientsPerShare: Number(process.env.SHARE_MAX_RECIPIENTS || 5),
    /** Max distinct items one Pro may share with the same Free user. */
    maxItemsProToSameFree: Number(process.env.SHARE_MAX_ITEMS_PRO_TO_FREE || 5),
    /** Max distinct active incoming shared items a Free account may hold. */
    maxIncomingSharesFree: Number(process.env.SHARE_MAX_INCOMING_FREE || 5),
    /** Max share records created by one sender per rolling hour. */
    maxSharesPerHour: Number(process.env.SHARE_MAX_PER_HOUR || 30),
    /** Unique free recipients below this count triggers concentration logging. */
    concentrationRecipientThreshold: Number(
      process.env.SHARE_CONCENTRATION_RECIPIENT_THRESHOLD || 3,
    ),
    /** Min active shares to those few free users before logging the pattern. */
    concentrationShareThreshold: Number(
      process.env.SHARE_CONCENTRATION_SHARE_THRESHOLD || 8,
    ),
  },
  emailFrom:
    process.env.SUBSCRIPTION_EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "no-reply@novasafe.io",
} as const;

export type EntitlementKey =
  | "canUseCloudSync"
  | "canUseCSVImportExport"
  | "canUseUnlimitedPasswords"
  | "canUseUnlimitedNotes"
  | "canUseUnlimitedVaultItems"
  | "canUseFolders"
  | "canUseAuthenticator"
  | "canUseAttachments"
  | "canShareItems"
  | "canUsePasswordHistory"
  | "canUseAdvancedSecurity"
  | "canUseMultiDevice";

export const FREE_ENTITLEMENTS: Record<EntitlementKey, boolean> = {
  canUseCloudSync: false,
  canUseCSVImportExport: false,
  canUseUnlimitedPasswords: false,
  canUseUnlimitedNotes: false,
  canUseUnlimitedVaultItems: false,
  canUseFolders: false,
  /** Free may use authenticators within the shared vault+authenticator slot cap. */
  canUseAuthenticator: true,
  canUseAttachments: false,
  canShareItems: false,
  canUsePasswordHistory: false,
  canUseAdvancedSecurity: false,
  canUseMultiDevice: false,
};

export const PRO_ENTITLEMENTS: Record<EntitlementKey, boolean> = {
  canUseCloudSync: true,
  canUseCSVImportExport: true,
  canUseUnlimitedPasswords: true,
  canUseUnlimitedNotes: true,
  canUseUnlimitedVaultItems: true,
  canUseFolders: true,
  canUseAuthenticator: true,
  canUseAttachments: true,
  canShareItems: true,
  canUsePasswordHistory: true,
  canUseAdvancedSecurity: true,
  canUseMultiDevice: true,
};
