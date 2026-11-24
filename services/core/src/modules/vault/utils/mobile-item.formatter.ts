export interface MobileItemSummary {
  id: string;
  title?: string;
  category?: string;
  folderId?: string;
  isFavorite?: boolean;
  hasMfa?: boolean;
  field_count?: number;
  attachment_count?: number;
  accessCount?: number;
  lastAccessedAt?: Date | string | null;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  strength?: 'weak' | 'medium' | 'strong';
  tags?: string[];
  logoUrl?: string | null;
  url?: string | null;
}

/** True when decrypted payload carries a TOTP secret, or a linked authenticator entry exists. */
export const itemHasMfa = (item: Record<string, unknown>): boolean => {
  if (item.hasLinkedAuthenticator === true) return true;
  const raw = item.mfaSecret ?? item.mfa_secret;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim();
  return s.length > 0 && s !== 'null' && s !== 'undefined';
};

export const toMobileItemSummary = (item: Record<string, unknown>): MobileItemSummary => ({
  id: String((item as { _id?: { toString?: () => string }; id?: string })._id?.toString?.() || item.id || ''),
  title: item.title as string | undefined,
  category: item.category as string | undefined,
  folderId:
    (item.folderId as { toString?: () => string })?.toString?.() || (item.folderId as string | undefined),
  isFavorite: Boolean(item.isFavorite),
  hasMfa: itemHasMfa(item),
  field_count: (item.field_count as number) || 0,
  attachment_count: (item.attachment_count as number) || 0,
  accessCount: (item.accessCount as number) || 0,
  strength: item.strength as MobileItemSummary['strength'],
  tags: (item.tags as string[]) || [],
  logoUrl: (item.logoUrl as string | null) || null,
  url: (item.url as string | null) || null,
  lastAccessedAt: (item.lastAccessedAt as Date | string | null) || null,
  updatedAt: item.updatedAt as Date | string | undefined,
  createdAt: item.createdAt as Date | string | undefined,
});

export const toMobileItemDetail = (item: Record<string, unknown>): Record<string, unknown> => {
  const rawMfa = item.mfaSecret ?? item.mfa_secret;
  const mfaSecret =
    rawMfa === undefined || rawMfa === null || String(rawMfa).trim() === ''
      ? null
      : String(rawMfa).trim();

  return {
    ...toMobileItemSummary(item),
    type: item.type || item.category || 'login',
    username: item.username,
    password: item.password,
    url: item.url,
    notes: item.notes,
    cardNumber: item.cardNumber,
    apiKey: item.apiKey,
    // Encrypted TOTP secret — must round-trip on create/update/get or edit reload drops 2FA.
    mfaSecret,
    tags: (item.tags as string[]) || [],
    password_versions: item.password_versions || [],
    custom_fields: item.custom_fields || [],
  };
};
