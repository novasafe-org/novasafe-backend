import type { ObjectId } from 'mongodb';

export type ChangelogCategory = 'feature' | 'improvement' | 'security' | 'bugfix' | 'performance';

export type ChangelogStatus = 'draft' | 'published' | 'scheduled';

export interface ChangelogReleaseRecord {
  _id: ObjectId;
  version: string;
  title: string;
  category: ChangelogCategory;
  summary: string;
  notes: string[];
  content_markdown: string;
  tags: string[];
  status: ChangelogStatus;
  publishedAt: Date | null;
  isPublic: boolean;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ChangelogReleaseDto = {
  id: string;
  version: string;
  title: string;
  category: ChangelogCategory;
  summary: string;
  notes: string[];
  content_markdown: string;
  tags: string[];
  status: ChangelogStatus;
  publishedAt: string | null;
  isPublic: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export function toChangelogDto(item: ChangelogReleaseRecord): ChangelogReleaseDto {
  return {
    id: String(item._id),
    version: item.version,
    title: item.title,
    category: item.category,
    summary: item.summary,
    notes: item.notes ?? [],
    content_markdown: item.content_markdown ?? '',
    tags: item.tags ?? [],
    status: item.status ?? (item.isPublic !== false ? 'published' : 'draft'),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    isPublic: item.isPublic !== false,
    slug: item.slug,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function isChangelogPubliclyVisible(item: ChangelogReleaseRecord, now = new Date()): boolean {
  if (item.isPublic === false) return false;
  const status = item.status ?? 'published';
  if (status === 'draft') return false;
  if (status === 'scheduled') {
    return item.publishedAt != null && item.publishedAt.getTime() <= now.getTime();
  }
  if (status === 'published') {
    return item.publishedAt == null || item.publishedAt.getTime() <= now.getTime();
  }
  return false;
}
