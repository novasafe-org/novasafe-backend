/** Mongo collection names — aligned with core / mobile_vault (read-only from admin-app). */
export const VAULT_COLLECTIONS = {
  vaultUsers: 'vaultUsers',
  subscriptions: 'mobileSubscriptions',
  devices: 'devices',
  vaultItems: 'vaultItems',
  sessions: 'sessions',
} as const;

/** Shape persisted under mobileSubscriptions.state */
export type SubscriptionState = {
  tier?: string;
  isActive?: boolean;
  inGracePeriod?: boolean;
  isPro?: boolean;
  productId?: string | null;
};
