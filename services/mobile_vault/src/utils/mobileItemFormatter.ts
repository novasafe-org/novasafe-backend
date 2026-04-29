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
}

export const toMobileItemSummary = (item: any): MobileItemSummary => ({
  id: item?._id?.toString?.() || item?.id,
  title: item?.title,
  category: item?.category,
  folderId: item?.folderId?.toString?.() || item?.folderId,
  isFavorite: Boolean(item?.isFavorite),
  field_count: item?.field_count || 0,
  attachment_count: item?.attachment_count || 0,
  accessCount: item?.accessCount || 0,
  strength: item?.strength,
  lastAccessedAt: item?.lastAccessedAt || null,
  updatedAt: item?.updatedAt,
  createdAt: item?.createdAt,
});

export const toMobileItemDetail = (item: any): Record<string, any> => ({
  ...toMobileItemSummary(item),
  type: item?.type || item?.category || 'login',
  username: item?.username,
  password: item?.password,
  url: item?.url,
  notes: item?.notes,
  cardNumber: item?.cardNumber,
  apiKey: item?.apiKey,
  encrypted_data: item?.encrypted_data,
  iv: item?.iv,
  tags: item?.tags || [],
  password_versions: item?.password_versions || [],
  custom_fields: item?.custom_fields || [],
});
