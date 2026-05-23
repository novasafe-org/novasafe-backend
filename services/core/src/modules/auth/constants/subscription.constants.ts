/** Mirrors mobile_vault subscriptionConfig entitlements for auth session gating. */
export type EntitlementKey =
  | 'canUseCloudSync'
  | 'canUseCSVImportExport'
  | 'canUseUnlimitedPasswords'
  | 'canUseUnlimitedNotes'
  | 'canUsePasswordHistory'
  | 'canUseAdvancedSecurity'
  | 'canUseMultiDevice';

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

export const FREE_PLAN_MAX_DEVICES = Number(process.env.FREE_PLAN_MAX_DEVICES || 1);
export const FREE_PLAN_MAX_PASSWORDS = Number(process.env.FREE_PLAN_MAX_PASSWORDS || 15);
export const FREE_PLAN_MAX_SECURE_NOTES = Number(process.env.FREE_PLAN_MAX_SECURE_NOTES || 5);
