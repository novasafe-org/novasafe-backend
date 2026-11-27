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
  /** Flat vault folders (one level; items reference via folderId). */
  folders: 'folders',
  /** Reserved for secure notes module. */
  notes: 'notes',
  /** Vault documents module (NAS under userId/documents). */
  documents: 'documents',
  /**
   * Authenticator / TOTP entries (standalone or linked to a vault item).
   * Secrets encrypted; metadata (issuer, account, algo, digits, period) plaintext for listing.
   */
  authenticatorEntries: 'authenticatorEntries',
  /** Per-vault-item file attachments (NAS under userId/items attachments/<itemId>). */
  itemAttachments: 'itemAttachments',
  /** Trusted device registry (multi-device policy). */
  devices: 'devices',
  /** Pending new-login / single-device conflict alerts (push + in-app consent). */
  deviceLoginAlerts: 'deviceLoginAlerts',
  /** Reserved for in-app / push notification records. */
  notifications: 'notifications',
  /** Reserved for platform audit trail (separate from export history). */
  auditLogs: 'audit_logs',
  /** Status page — monitorable services (API, Web Vault, …). */
  statusServices: 'services',
  /** Status page — incidents, degradations, maintenance. */
  statusIncidents: 'incidents',
  /** Status page — daily uptime snapshots per service. */
  statusSnapshots: 'service_status_snapshots',
  /** Feature flag overrides (written by admin-api, read by mobile-api). */
  featureFlags: 'feature_flags',
  /** Platform metadata — encrypted NAS agent auth token (exact Mongo collection name). */
  novaSafeMetadata: 'NovaSafe metadata',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
