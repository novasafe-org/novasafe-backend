import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import {
  assertCanCreateFolder,
  assertCanModifyVault,
} from '../../subscriptions/services/subscription.service';

const db = getNativeMongo();

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const bumpVaultDataRevision = async (userId: string): Promise<void> => {
  if (!userId || !ObjectId.isValid(userId)) return;
  try {
    await db.updateOne(
      COLLECTIONS.vaultUsers,
      { _id: new ObjectId(userId) },
      { $inc: { vaultDataRevision: 1 }, $set: { vaultDataRevisionUpdatedAt: new Date() } },
    );
  } catch {
    /* ignore */
  }
};

const activeFolderFilter = (userId: string, extra: Record<string, unknown> = {}) => ({
  ...userFilter(userId),
  deleted: { $ne: true },
  ...extra,
});

export type FolderConflictError = {
  code: 'FOLDER_NOT_EMPTY' | 'FOLDER_NAME_EXISTS' | 'FOLDER_NOT_FOUND' | 'INVALID_FOLDER';
  message: string;
};

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export const normalizeFolderColor = (raw: unknown): string | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = String(raw).trim();
  if (!HEX_COLOR_RE.test(value)) return null;
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase()
    : value.toUpperCase();
};

export const toFolderResponse = (folder: Record<string, unknown>, itemCount = 0) => ({
  id: String((folder as { _id?: { toString?: () => string } })._id?.toString?.() || folder.id || ''),
  name: String(folder.name || ''),
  color: normalizeFolderColor(folder.color),
  itemCount,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
});

const countItemsInFolder = async (userId: string, folderId: ObjectId): Promise<number> => {
  return db.getDb().collection(COLLECTIONS.vaultItems).countDocuments({
    ...userFilter(userId),
    folderId,
    deleted: { $ne: true },
    deleted_at: null,
  });
};

export const listFolders = async (userId: string) => {
  const folders = await db.findMany(
    COLLECTIONS.folders,
    activeFolderFilter(userId),
    { sort: { name: 1 } },
  );

  return Promise.all(
    folders.map(async (folder: any) => {
      const itemCount = await countItemsInFolder(userId, folder._id);
      return toFolderResponse(folder, itemCount);
    }),
  );
};

export const getFolderById = async (userId: string, id: string) => {
  if (!ObjectId.isValid(id)) return null;
  const folder = await db.findOne(
    COLLECTIONS.folders,
    activeFolderFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!folder) return null;
  const itemCount = await countItemsInFolder(userId, new ObjectId(id));
  return toFolderResponse(folder as Record<string, unknown>, itemCount);
};

export const assertFolderOwned = async (userId: string, folderId: string | null | undefined) => {
  if (folderId === undefined || folderId === null || folderId === '') {
    return { ok: true as const, folderId: null as ObjectId | null };
  }
  if (!ObjectId.isValid(folderId)) {
    return {
      ok: false as const,
      error: { code: 'INVALID_FOLDER' as const, message: 'Invalid folder id' },
    };
  }
  const folder = await db.findOne(
    COLLECTIONS.folders,
    activeFolderFilter(userId, { _id: new ObjectId(folderId) }),
  );
  if (!folder) {
    return {
      ok: false as const,
      error: { code: 'FOLDER_NOT_FOUND' as const, message: 'Folder not found' },
    };
  }
  return { ok: true as const, folderId: new ObjectId(folderId) };
};

export const createFolder = async (userId: string, name: string, colorRaw?: unknown) => {
  const allowed = await assertCanCreateFolder(userId);
  if (allowed.ok === false) {
    return {
      ok: false as const,
      error: {
        code: (allowed.code || 'NOVASAFE_SUBSCRIPTION_REQUIRED') as string,
        message: allowed.message,
      },
    };
  }

  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return {
      ok: false as const,
      error: { code: 'INVALID_FOLDER' as const, message: 'Folder name is required' },
    };
  }

  let color: string | null = null;
  if (colorRaw !== undefined && colorRaw !== null && String(colorRaw).trim() !== '') {
    color = normalizeFolderColor(colorRaw);
    if (!color) {
      return {
        ok: false as const,
        error: { code: 'INVALID_FOLDER' as const, message: 'color must be a hex value like #E8F0EB' },
      };
    }
  }

  const existing = await db.findOne(
    COLLECTIONS.folders,
    activeFolderFilter(userId, { name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }),
  );
  if (existing) {
    return {
      ok: false as const,
      error: { code: 'FOLDER_NAME_EXISTS' as const, message: 'A folder with this name already exists' },
    };
  }

  const now = new Date();
  const doc = {
    userId: new ObjectId(userId),
    name: trimmed,
    color,
    source: 'mobile',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deletedAt: null,
  };
  const result = await db.insertOne(COLLECTIONS.folders, doc);
  await bumpVaultDataRevision(userId);
  const inserted = await db.findOne(COLLECTIONS.folders, { _id: result.insertedId });
  return {
    ok: true as const,
    folder: toFolderResponse((inserted || { ...doc, _id: result.insertedId }) as Record<string, unknown>, 0),
  };
};

export const updateFolder = async (
  userId: string,
  id: string,
  name: string,
  colorRaw?: unknown,
) => {
  const canWrite = await assertCanModifyVault(userId);
  if (canWrite.ok === false) {
    return {
      ok: false as const,
      error: {
        code: (canWrite.code || 'NOVASAFE_SUBSCRIPTION_READ_ONLY') as string,
        message: canWrite.message,
      },
    };
  }
  if (!ObjectId.isValid(id)) {
    return {
      ok: false as const,
      error: { code: 'INVALID_FOLDER' as const, message: 'Invalid folder id' },
    };
  }
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return {
      ok: false as const,
      error: { code: 'INVALID_FOLDER' as const, message: 'Folder name is required' },
    };
  }

  const folder = await db.findOne(
    COLLECTIONS.folders,
    activeFolderFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!folder) {
    return {
      ok: false as const,
      error: { code: 'FOLDER_NOT_FOUND' as const, message: 'Folder not found' },
    };
  }

  const duplicate = await db.findOne(COLLECTIONS.folders, {
    ...activeFolderFilter(userId),
    _id: { $ne: new ObjectId(id) },
    name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (duplicate) {
    return {
      ok: false as const,
      error: { code: 'FOLDER_NAME_EXISTS' as const, message: 'A folder with this name already exists' },
    };
  }

  const update: Record<string, unknown> = {
    name: trimmed,
    updatedAt: new Date(),
    source: 'mobile',
  };
  if (colorRaw !== undefined) {
    if (colorRaw === null || String(colorRaw).trim() === '') {
      update.color = null;
    } else {
      const color = normalizeFolderColor(colorRaw);
      if (!color) {
        return {
          ok: false as const,
          error: { code: 'INVALID_FOLDER' as const, message: 'color must be a hex value like #E8F0EB' },
        };
      }
      update.color = color;
    }
  }

  await db.updateOne(
    COLLECTIONS.folders,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set: update },
  );
  await bumpVaultDataRevision(userId);
  const updated = await getFolderById(userId, id);
  return { ok: true as const, folder: updated! };
};

export const deleteFolder = async (userId: string, id: string) => {
  if (!ObjectId.isValid(id)) {
    return {
      ok: false as const,
      error: { code: 'INVALID_FOLDER' as const, message: 'Invalid folder id' },
    };
  }

  const folder = await db.findOne(
    COLLECTIONS.folders,
    activeFolderFilter(userId, { _id: new ObjectId(id) }),
  );
  if (!folder) {
    return {
      ok: false as const,
      error: { code: 'FOLDER_NOT_FOUND' as const, message: 'Folder not found' },
    };
  }

  const itemCount = await countItemsInFolder(userId, new ObjectId(id));
  if (itemCount > 0) {
    return {
      ok: false as const,
      error: {
        code: 'FOLDER_NOT_EMPTY' as const,
        message: 'Move or delete items in this folder before deleting it',
      },
    };
  }

  await db.updateOne(
    COLLECTIONS.folders,
    { _id: new ObjectId(id), ...userFilter(userId) },
    { $set: { deleted: true, deletedAt: new Date(), updatedAt: new Date(), source: 'mobile' } },
  );
  await bumpVaultDataRevision(userId);
  return { ok: true as const };
};
