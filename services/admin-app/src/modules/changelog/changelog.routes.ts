import { Router, type Request } from 'express';
import { randomBytes } from 'crypto';

import { ADMIN_COLLECTIONS, getDb, ObjectId } from '../../database/mongo';
import {
  authMiddleware,
  getPermissionAction,
  requirePermission,
  verifyAdminToken,
} from '../rbac/rbac.service';
import type { AdminJwtPayload, AdminRoleKey } from '../rbac/rbac.types';
import {
  type ChangelogCategory,
  type ChangelogReleaseRecord,
  type ChangelogStatus,
  isChangelogPubliclyVisible,
  toChangelogDto,
} from './changelog.types';

const CATEGORIES: ChangelogCategory[] = ['feature', 'improvement', 'security', 'bugfix', 'performance'];
const STATUSES: ChangelogStatus[] = ['draft', 'published', 'scheduled'];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseNotes(body: unknown): string[] {
  if (Array.isArray(body)) return body.map(String).filter(Boolean);
  if (typeof body === 'string' && body.trim()) {
    return body
      .split(/\n+/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCategory(value: unknown): ChangelogCategory {
  const raw = String(value ?? 'feature').toLowerCase();
  if (raw === 'bug fix' || raw === 'bugfix') return 'bugfix';
  if (CATEGORIES.includes(raw as ChangelogCategory)) return raw as ChangelogCategory;
  return 'feature';
}

function normalizeStatus(value: unknown, fallback: ChangelogStatus = 'draft'): ChangelogStatus {
  const raw = String(value ?? fallback).toLowerCase();
  return STATUSES.includes(raw as ChangelogStatus) ? (raw as ChangelogStatus) : fallback;
}

async function resolveAdminReader(req: Request): Promise<AdminJwtPayload | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyAdminToken(header.slice(7));
    const action = await getPermissionAction(payload.roleKey as AdminRoleKey, 'changelog.read');
    if (action === 'none') return null;
    return payload;
  } catch {
    return null;
  }
}

function serializeLegacy(doc: ChangelogReleaseRecord): ChangelogReleaseRecord {
  return {
    ...doc,
    notes: doc.notes ?? [],
    content_markdown: doc.content_markdown ?? (doc.notes ?? []).join('\n'),
    tags: doc.tags ?? [],
    status: doc.status ?? (doc.isPublic !== false ? 'published' : 'draft'),
    publishedAt: doc.publishedAt ?? doc.createdAt,
  };
}

export function createChangelogRoutes(): Router {
  const router = Router();

  /** Public + admin list — unauthenticated callers only see published public releases. */
  router.get('/', async (req, res, next) => {
    try {
      const admin = await resolveAdminReader(req);
      const items = await getDb()
        .collection<ChangelogReleaseRecord>(ADMIN_COLLECTIONS.changelog)
        .find({})
        .sort({ publishedAt: -1, createdAt: -1 })
        .toArray();

      const mapped = items.map(serializeLegacy);
      const visible = admin
        ? mapped
        : mapped.filter((item) => isChangelogPubliclyVisible(item));

      res.json({ success: true, data: visible.map(toChangelogDto) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid id' });
        return;
      }
      const admin = await resolveAdminReader(req);
      const item = await getDb()
        .collection<ChangelogReleaseRecord>(ADMIN_COLLECTIONS.changelog)
        .findOne({ _id: new ObjectId(req.params.id) });
      if (!item) {
        res.status(404).json({ success: false, message: 'Release not found' });
        return;
      }
      const doc = serializeLegacy(item);
      if (!admin && !isChangelogPubliclyVisible(doc)) {
        res.status(404).json({ success: false, message: 'Release not found' });
        return;
      }
      res.json({ success: true, data: toChangelogDto(doc) });
    } catch (err) {
      next(err);
    }
  });

  router.use(authMiddleware);

  router.post('/', requirePermission('changelog.manage', 'manage'), async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const now = new Date();
      const title = String(body.title || '').trim();
      const version = String(body.version || '').trim();
      if (!title || !version) {
        res.status(400).json({ success: false, message: 'title and version are required' });
        return;
      }

      const status = normalizeStatus(body.status, 'draft');
      const publishedAt =
        body.publishedAt != null && body.publishedAt !== ''
          ? new Date(body.publishedAt)
          : status === 'published'
            ? now
            : null;

      const contentMarkdown = String(body.content_markdown ?? body.contentMarkdown ?? '');
      const notes = parseNotes(body.notes).length ? parseNotes(body.notes) : parseNotes(contentMarkdown);

      const doc: Omit<ChangelogReleaseRecord, '_id'> = {
        version,
        title,
        category: normalizeCategory(body.category),
        summary: String(body.summary || ''),
        notes,
        content_markdown: contentMarkdown || notes.join('\n'),
        tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
        status,
        publishedAt,
        isPublic: body.isPublic !== false,
        slug: slugify(`${version}-${title}`) || randomBytes(4).toString('hex'),
        createdAt: now,
        updatedAt: now,
      };

      const result = await getDb().collection(ADMIN_COLLECTIONS.changelog).insertOne(doc);
      res.status(201).json({
        success: true,
        data: toChangelogDto({ _id: result.insertedId, ...doc }),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', requirePermission('changelog.manage', 'manage'), async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid id' });
        return;
      }
      const body = req.body ?? {};
      const update: Record<string, unknown> = { updatedAt: new Date() };

      if (body.title !== undefined) update.title = String(body.title);
      if (body.version !== undefined) update.version = String(body.version);
      if (body.category !== undefined) update.category = normalizeCategory(body.category);
      if (body.summary !== undefined) update.summary = String(body.summary);
      if (body.notes !== undefined) update.notes = parseNotes(body.notes);
      if (body.content_markdown !== undefined || body.contentMarkdown !== undefined) {
        const md = String(body.content_markdown ?? body.contentMarkdown ?? '');
        update.content_markdown = md;
        if (body.notes === undefined && md) update.notes = parseNotes(md);
      }
      if (body.tags !== undefined) {
        update.tags = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [];
      }
      if (body.status !== undefined) update.status = normalizeStatus(body.status);
      if (body.isPublic !== undefined) update.isPublic = Boolean(body.isPublic);
      if (body.publishedAt !== undefined) {
        update.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
      }

      await getDb()
        .collection(ADMIN_COLLECTIONS.changelog)
        .updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });

      const item = await getDb()
        .collection<ChangelogReleaseRecord>(ADMIN_COLLECTIONS.changelog)
        .findOne({ _id: new ObjectId(req.params.id) });

      res.json({ success: true, data: item ? toChangelogDto(serializeLegacy(item)) : null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission('changelog.manage', 'manage'), async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid id' });
        return;
      }
      await getDb().collection(ADMIN_COLLECTIONS.changelog).deleteOne({ _id: new ObjectId(req.params.id) });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
