import {
  getSubscriptionStateForUser,
  hasEntitlement,
} from '../../subscriptions/services/subscription.service';

export type PasswordVersionRecord = {
  id?: string;
  credential_id?: string;
  password?: string;
  is_expired: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
};

/**
 * Returns whether the user may receive decrypted password history in API responses.
 * Uses cached subscription state (same source as requireEntitlement middleware).
 */
export async function userCanAccessPasswordHistory(userId: string): Promise<boolean> {
  const state = await getSubscriptionStateForUser(userId);
  return hasEntitlement(state, 'canUsePasswordHistory');
}

/**
 * Strip plaintext passwords from historical versions when the caller lacks
 * canUsePasswordHistory. Pro users receive the full array unchanged.
 *
 * Free users receive metadata-only entries (id, credential_id, is_expired, timestamps)
 * per Phase 1 Option B — no historical plaintext is ever serialized.
 */
export function redactPasswordVersionsForEntitlement(
  versions: PasswordVersionRecord[],
  canAccessPasswordHistory: boolean,
): PasswordVersionRecord[] {
  if (canAccessPasswordHistory) return versions;
  return versions.map(({ password: _password, ...metadata }) => metadata);
}
