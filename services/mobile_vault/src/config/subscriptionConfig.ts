export const SUBSCRIPTION_CONFIG = {
  provider: "revenuecat",
  webhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET || "",
  apiKey: process.env.REVENUECAT_API_KEY || "",
  projectId: process.env.REVENUECAT_PROJECT_ID || "",
  apiBaseUrl: process.env.REVENUECAT_API_BASE_URL || "https://api.revenuecat.com/v1",
  /** Must match the entitlement identifier in RevenueCat (your project uses `pro`). */
  entitlementPro: process.env.REVENUECAT_ENTITLEMENT_PRO || "pro",
  offeringDefault:
    process.env.REVENUECAT_DEFAULT_OFFERING_ID || "default",
  freeLimits: {
    maxPasswords: Number(process.env.FREE_PLAN_MAX_PASSWORDS || 15),
    maxSecureNotes: Number(process.env.FREE_PLAN_MAX_SECURE_NOTES || 5),
    maxDevices: Number(process.env.FREE_PLAN_MAX_DEVICES || 1),
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
  | "canUsePasswordHistory"
  | "canUseAdvancedSecurity"
  | "canUseMultiDevice";

export const FREE_ENTITLEMENTS: Record<EntitlementKey, boolean> = {
  canUseCloudSync: false,
  canUseCSVImportExport: false,
  canUseUnlimitedPasswords: false,
  canUseUnlimitedNotes: false,
  canUsePasswordHistory: false,
  canUseAdvancedSecurity: false,
  canUseMultiDevice: false,
};

export const PRO_ENTITLEMENTS: Record<EntitlementKey, boolean> = {
  canUseCloudSync: true,
  canUseCSVImportExport: true,
  canUseUnlimitedPasswords: true,
  canUseUnlimitedNotes: true,
  canUsePasswordHistory: true,
  canUseAdvancedSecurity: true,
  canUseMultiDevice: true,
};
