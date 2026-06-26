export interface MobileItemSummary {
  id: string;
  title?: string;
  category?: string;
  folderId?: string;
  isFavorite?: boolean;
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

export const toMobileItemSummary = (item: Record<string, unknown>): MobileItemSummary => ({
  id: String((item as { _id?: { toString?: () => string }; id?: string })._id?.toString?.() || item.id || ''),
  title: item.title as string | undefined,
  category: item.category as string | undefined,
  folderId:
    (item.folderId as { toString?: () => string })?.toString?.() || (item.folderId as string | undefined),
  isFavorite: Boolean(item.isFavorite),
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

export const toMobileItemDetail = (item: Record<string, unknown>): Record<string, unknown> => ({
  ...toMobileItemSummary(item),
  type: item.type || item.category || 'login',
  username: item.username,
  password: item.password,
  url: item.url,
  notes: item.notes,
  cardNumber: item.cardNumber,
  apiKey: item.apiKey,
  tags: (item.tags as string[]) || [],
  password_versions: item.password_versions || [],
  custom_fields: item.custom_fields || [],
});
