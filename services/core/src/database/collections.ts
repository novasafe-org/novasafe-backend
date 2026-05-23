/**
 * MongoDB collection names — aligned with `mobile_vault` for migration compatibility.
 * Do not rename without a coordinated data migration.
 */
export const COLLECTIONS = {
  vaultItems: 'vaultItems',
  vaultUsers: 'vaultUsers',
  sessions: 'sessions',
  passwordVersions: 'mobilePasswordVersions',
  customFields: 'mobileCustomFields',
  otpCodes: 'mobileOtpCodes',
  twoFactorChallenges: 'mobileTwoFactorChallenges',
  exportHistory: 'mobileExportHistory',
  shareRecords: 'mobileShareRecords',
  subscriptions: 'mobileSubscriptions',
  subscriptionEvents: 'mobileSubscriptionEvents',
  entitlements: 'mobileEntitlements',
  purchaseHistory: 'mobilePurchaseHistory',
  /** Reserved for future folder hierarchy (not used in mobile_vault yet). */
  folders: 'folders',
  /** Reserved for secure notes module. */
  notes: 'notes',
  /** Reserved for document attachments module. */
  documents: 'documents',
  /** Reserved for in-app / push notification records. */
  notifications: 'notifications',
  /** Reserved for platform audit trail (separate from export history). */
  auditLogs: 'audit_logs',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
