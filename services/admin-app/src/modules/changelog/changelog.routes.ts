import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';

import { ADMIN_COLLECTIONS, getDb, ObjectId } from '../../database/mongo';
import { authMiddleware, requirePermission } from '../rbac/rbac.service';
import type { ChangelogReleaseRecord } from '../rbac/rbac.types';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createChangelogRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', requirePermission('changelog.read'), async (_req, res, next) => {
    try {
      const items = await getDb()
        .collection<ChangelogReleaseRecord>(ADMIN_COLLECTIONS.changelog)
        .find({})
        .sort({ publishedAt: -1 })
        .toArray();
      res.json({
        success: true,
        data: items.map((item) => ({
          id: String(item._id),
          version: item.version,
          title: item.title,
          category: item.category,
          summary: item.summary,
          notes: item.notes,
          publishedAt: item.publishedAt.toISOString(),
          isPublic: item.isPublic,
          slug: item.slug,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

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
      const doc: Omit<ChangelogReleaseRecord, '_id'> = {
        version,
        title,
        category: body.category || 'feature',
        summary: String(body.summary || ''),
        notes: Array.isArray(body.notes) ? body.notes.map(String) : [],
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : now,
        isPublic: body.isPublic !== false,
        slug: slugify(`${version}-${title}`) || randomBytes(4).toString('hex'),
        createdAt: now,
        updatedAt: now,
      };
      const result = await getDb().collection(ADMIN_COLLECTIONS.changelog).insertOne(doc);
      res.status(201).json({ success: true, data: { id: String(result.insertedId), ...doc } });
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
      const patch = req.body ?? {};
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.title !== undefined) update.title = String(patch.title);
      if (patch.version !== undefined) update.version = String(patch.version);
      if (patch.category !== undefined) update.category = patch.category;
      if (patch.summary !== undefined) update.summary = String(patch.summary);
      if (patch.notes !== undefined) update.notes = patch.notes;
      if (patch.isPublic !== undefined) update.isPublic = Boolean(patch.isPublic);
      if (patch.publishedAt !== undefined) update.publishedAt = new Date(patch.publishedAt);

      await getDb()
        .collection(ADMIN_COLLECTIONS.changelog)
        .updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
      res.json({ success: true });
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
