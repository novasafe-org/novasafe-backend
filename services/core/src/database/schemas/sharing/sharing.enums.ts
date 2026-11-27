/** Share-level lifecycle. */
export enum ShareStatus {
  Active = 'active',
  Revoked = 'revoked',
  Expired = 'expired',
}

/** Per-recipient lifecycle. */
export enum ShareRecipientStatus {
  Pending = 'pending',
  Active = 'active',
  Revoked = 'revoked',
  Suspended = 'suspended',
  Declined = 'declined',
}

export enum ShareResourceType {
  VaultItem = 'vault_item',
  /** NovaSafe Cards module — storage-only payment/membership cards. */
  Card = 'card',
}

/** Allowed expiry presets (days) from the permission screen. */
export const SHARE_EXPIRY_PRESETS_DAYS = [1, 3, 7, 15] as const;
export type ShareExpiryPresetDays = (typeof SHARE_EXPIRY_PRESETS_DAYS)[number];
export const SHARE_EXPIRY_DEFAULT_DAYS: ShareExpiryPresetDays = 7;
/** Max recipients per share invite (~Pro recipient cap). */
export const SHARE_MAX_RECIPIENTS = 5;
