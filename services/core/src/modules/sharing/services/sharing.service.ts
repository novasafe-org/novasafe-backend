import crypto from 'node:crypto';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { SharePermission } from '../../../database/schemas/common/sharing-permission.schema';
import {
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_PRESETS_DAYS,
  SHARE_MAX_RECIPIENTS,
  ShareRecipientStatus,
  ShareResourceType,
  ShareStatus,
  type ShareExpiryPresetDays,
} from '../../../database/schemas/sharing';
import { getUserRepository } from '../../auth/repositories/user.repository';
import { sendShareInviteEmail } from '../../auth/services/email.service';

const db = getNativeMongo();
const col = () => db.collection(COLLECTIONS.shareRecords);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const permissionLabel = (permission: string): 'View only' | 'Can edit' =>
  permission === SharePermission.Editor || permission === 'Editor' ? 'Can edit' : 'View only';

export const parsePermission = (raw: unknown): SharePermission => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'editor' || value === 'can edit' || value === 'can-edit' || value === 'edit') {
    return SharePermission.Editor;
  }
  return SharePermission.Viewer;
};

export const parseExpiryDays = (raw: unknown): ShareExpiryPresetDays => {
  const n = Number(raw);
  if ((SHARE_EXPIRY_PRESETS_DAYS as readonly number[]).includes(n)) {
    return n as ShareExpiryPresetDays;
  }
  return SHARE_EXPIRY_DEFAULT_DAYS;
};

const isActiveRecipientStatus = (status: string) =>
  status === ShareRecipientStatus.Pending || status === ShareRecipientStatus.Active;

const countActiveRecipients = (recipients: Array<{ status?: string }>) =>
  recipients.filter((r) => isActiveRecipientStatus(String(r.status || ''))).length;

const shareWebBase = () =>
  (process.env.SHARE_WEB_BASE_URL || process.env.WEB_APP_URL || 'https://app.novasafe.io').replace(
    /\/$/,
    '',
  );

const accessUrlForToken = (token: string) => `${shareWebBase()}/share/access/${token}`;

const generateAccessToken = () => `ns_share_${crypto.randomBytes(18).toString('hex')}`;

const userFilter = (userId: string) => ({
  $or: [{ userId: new ObjectId(userId) }, { userId }],
});

const activeShareFilter = (extra: Record<string, unknown> = {}) => ({
  deleted: { $ne: true },
  ...extra,
});

const maybeMarkExpired = (doc: any): any => {
  if (!doc) return doc;
  if (
    doc.status === ShareStatus.Active &&
    doc.expiresAt &&
    new Date(doc.expiresAt).getTime() <= Date.now()
  ) {
    return { ...doc, status: ShareStatus.Expired };
  }
  return doc;
};

const toRecipientDto = (r: any) => ({
  id: r._id?.toString?.() || String(r._id || ''),
  email: r.email,
  userId: r.userId?.toString?.() || null,
  displayName: r.displayName || null,
  isNovaSafeUser: Boolean(r.isNovaSafeUser),
  status: r.status,
  invitedAt: r.invitedAt,
  acceptedAt: r.acceptedAt || null,
  revokedAt: r.revokedAt || null,
  suspendedAt: r.suspendedAt || null,
  lastAccessedAt: r.lastAccessedAt || null,
  hasWebLink: Boolean(r.accessToken) && !r.isNovaSafeUser,
});

const toShareSummary = (doc: any) => {
  const share = maybeMarkExpired(doc);
  const recipients = Array.isArray(share.recipients) ? share.recipients : [];
  const visible = recipients.filter((r: any) =>
    [ShareRecipientStatus.Pending, ShareRecipientStatus.Active, ShareRecipientStatus.Suspended].includes(
      r.status,
    ),
  );
  const names = visible.map((r: any) => r.displayName || r.email).filter(Boolean);
  const preview = names.slice(0, 2);
  const overflow = Math.max(0, names.length - preview.length);
  return {
    id: share._id?.toString?.(),
    resourceId: share.resourceId?.toString?.(),
    itemName: share.itemName,
    permission: share.permission,
    permissionLabel: permissionLabel(share.permission),
    status: share.status,
    expiresAt: share.expiresAt || null,
    lastAccessedAt: share.lastAccessedAt || null,
    recipientCount: share.recipientCount ?? recipients.length,
    activeRecipientCount: share.activeRecipientCount ?? countActiveRecipients(recipients),
    recipientPreview: preview,
    recipientOverflow: overflow,
    recipients: visible.map(toRecipientDto),
    senderName: share.senderName,
    senderEmail: share.senderEmail,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };
};

const toShareDetail = (doc: any) => {
  const summary = toShareSummary(doc);
  return {
    ...summary,
    resourceType: doc.resourceType || ShareResourceType.VaultItem,
    senderId: doc.senderId?.toString?.(),
    recipients: (doc.recipients || []).map(toRecipientDto),
    revokedAt: doc.revokedAt || null,
  };
};

const normalizeEmails = (emails: unknown): string[] => {
  if (!Array.isArray(emails)) return [];
  const cleaned = emails
    .map((e) => String(e || '').toLowerCase().trim())
    .filter((e) => EMAIL_RE.test(e));
  return Array.from(new Set(cleaned));
};

/** Exported for unit tests. */
export const normalizeEmailsForTest = (emails: unknown): string[] => normalizeEmails(emails);

/**
 * Resolve active share access for a vault item (With me viewer/editor).
 * Returns owner userId so vault can load/update the underlying item.
 */
export const findShareAccessForItem = async (
  userId: string,
  userEmail: string,
  resourceId: string,
  mode: 'view' | 'edit' = 'view',
) => {
  if (!ObjectId.isValid(resourceId) || !ObjectId.isValid(userId)) return null;
  const email = userEmail.toLowerCase().trim();
  const docs = await col()
    .find(
      activeShareFilter({
        resourceId: new ObjectId(resourceId),
        status: ShareStatus.Active,
        recipients: {
          $elemMatch: {
            $or: [{ userId: new ObjectId(userId) }, { email }],
            status: {
              $in:
                mode === 'edit'
                  ? [ShareRecipientStatus.Active]
                  : [ShareRecipientStatus.Pending, ShareRecipientStatus.Active],
            },
          },
        },
      }),
    )
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  for (const doc of docs) {
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) continue;
    const mine = findMyRecipient(doc, userId, email);
    if (!mine) continue;
    if (mode === 'edit' && permissionLabel(doc.permission) !== 'Can edit') continue;
    if (mode === 'edit' && mine.status !== ShareRecipientStatus.Active) continue;
    return {
      shareId: doc._id.toString(),
      ownerUserId: doc.senderId?.toString?.() || '',
      permission: doc.permission as string,
      permissionLabel: permissionLabel(doc.permission),
      recipientStatus: String(mine.status || ''),
    };
  }
  return null;
};

/** Look up the newest owned vault item by title (legacy /send without resourceId). */
export const findOwnedItemIdByTitle = async (userId: string, itemName: string) => {
  const title = String(itemName || '').trim();
  if (!title || !ObjectId.isValid(userId)) return null;
  const item = await db.collection(COLLECTIONS.vaultItems).findOne(
    {
      ...userFilter(userId),
      deleted: { $ne: true },
      deleted_at: null,
      title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    },
    { sort: { updatedAt: -1 } },
  );
  return item?._id?.toString?.() || null;
};

export type ServiceError = { code: string; message: string };

export const resolveRecipients = async (emailsRaw: unknown) => {
  const emails = normalizeEmails(emailsRaw);
  if (emails.length === 0) {
    return { ok: false as const, error: { code: 'INVALID_EMAILS', message: 'At least one valid email is required' } };
  }
  if (emails.length > SHARE_MAX_RECIPIENTS) {
    return {
      ok: false as const,
      error: {
        code: 'TOO_MANY_RECIPIENTS',
        message: `You can share with at most ${SHARE_MAX_RECIPIENTS} recipients`,
      },
    };
  }

  const users = getUserRepository();
  const resolved = await Promise.all(
    emails.map(async (email) => {
      const user = await users.findByEmail(email);
      if (user) {
        return {
          email,
          isNovaSafeUser: true,
          displayName: user.name || email.split('@')[0],
          userId: user._id.toString(),
          note: null as string | null,
        };
      }
      return {
        email,
        isNovaSafeUser: false,
        displayName: null as string | null,
        userId: null as string | null,
        note: 'User will receive a web link to access this item',
      };
    }),
  );

  return { ok: true as const, recipients: resolved };
};

const loadOwnedVaultItem = async (userId: string, resourceId: string) => {
  if (!ObjectId.isValid(resourceId)) return null;
  return db.findOne(COLLECTIONS.vaultItems, {
    _id: new ObjectId(resourceId),
    ...userFilter(userId),
    deleted: { $ne: true },
    deleted_at: null,
  });
};

const buildRecipients = async (emails: string[]) => {
  const users = getUserRepository();
  const now = new Date();
  const recipients = [];
  for (const email of emails) {
    const user = await users.findByEmail(email);
    const isNovaSafeUser = Boolean(user);
    recipients.push({
      _id: new ObjectId(),
      email,
      userId: user ? new ObjectId(user._id.toString()) : null,
      displayName: user?.name || null,
      isNovaSafeUser,
      accessToken: isNovaSafeUser ? null : generateAccessToken(),
      status: isNovaSafeUser ? ShareRecipientStatus.Pending : ShareRecipientStatus.Pending,
      invitedAt: now,
      acceptedAt: null,
      revokedAt: null,
      suspendedAt: null,
      lastAccessedAt: null,
    });
  }
  return recipients;
};

export const createShares = async (params: {
  senderId: string;
  senderEmail: string;
  senderName: string;
  resourceIds: string[];
  recipientEmails: string[];
  permissionRaw: unknown;
  expiresInDaysRaw: unknown;
  source?: string;
}) => {
  const emails = normalizeEmails(params.recipientEmails);
  if (emails.length === 0) {
    return { ok: false as const, error: { code: 'INVALID_EMAILS', message: 'At least one valid email is required' } };
  }
  if (emails.length > SHARE_MAX_RECIPIENTS) {
    return {
      ok: false as const,
      error: {
        code: 'TOO_MANY_RECIPIENTS',
        message: `You can share with at most ${SHARE_MAX_RECIPIENTS} recipients`,
      },
    };
  }

  const resourceIds = Array.from(
    new Set(
      (params.resourceIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => ObjectId.isValid(id)),
    ),
  );
  if (resourceIds.length === 0) {
    return { ok: false as const, error: { code: 'INVALID_ITEM', message: 'At least one vault item is required' } };
  }

  const senderEmail = params.senderEmail.toLowerCase().trim();
  if (emails.includes(senderEmail)) {
    return {
      ok: false as const,
      error: { code: 'CANNOT_SHARE_WITH_SELF', message: 'You cannot share an item with yourself' },
    };
  }

  const permission = parsePermission(params.permissionRaw);
  const expiresInDays = parseExpiryDays(params.expiresInDaysRaw);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  const recipients = await buildRecipients(emails);
  const created: any[] = [];

  for (const resourceId of resourceIds) {
    const item = await loadOwnedVaultItem(params.senderId, resourceId);
    if (!item) {
      return {
        ok: false as const,
        error: { code: 'ITEM_NOT_FOUND', message: 'Vault item not found or not owned by you' },
      };
    }
    const itemName = String((item as any).title || 'Vault item');
    const recipientsCopy = recipients.map((r) => ({
      ...r,
      _id: new ObjectId(),
      accessToken: r.isNovaSafeUser ? null : generateAccessToken(),
    }));

    const record = {
      resourceId: new ObjectId(resourceId),
      itemName,
      resourceType: ShareResourceType.VaultItem,
      senderId: new ObjectId(params.senderId),
      senderEmail,
      senderName: params.senderName || senderEmail || 'NovaSafe User',
      permission,
      recipients: recipientsCopy,
      status: ShareStatus.Active,
      expiresAt,
      lastAccessedAt: null,
      revokedAt: null,
      recipientCount: recipientsCopy.length,
      activeRecipientCount: recipientsCopy.length,
      source: params.source || 'mobile',
      createdBy: new ObjectId(params.senderId),
      updatedBy: new ObjectId(params.senderId),
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    const result = await col().insertOne(record);
    const saved = { ...record, _id: result.insertedId };

    for (const recipient of recipientsCopy) {
      const link = recipient.accessToken ? accessUrlForToken(recipient.accessToken) : undefined;
      await sendShareInviteEmail(
        recipient.email,
        record.senderName,
        itemName,
        permissionLabel(permission),
        link,
      );
    }

    created.push(toShareSummary(saved));
  }

  return {
    ok: true as const,
    message: 'Item shared securely',
    shares: created,
    expiresInDays,
  };
};

/** Group sent shares by resourceId for By me cards. */
export const listSentShares = async (senderId: string) => {
  const docs = await col()
    .find(
      activeShareFilter({
        senderId: new ObjectId(senderId),
        status: { $in: [ShareStatus.Active, ShareStatus.Expired] },
      }),
    )
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const byResource = new Map<string, any[]>();
  for (const doc of docs) {
    const key = doc.resourceId?.toString?.() || String(doc.resourceId);
    const list = byResource.get(key) || [];
    list.push(maybeMarkExpired(doc));
    byResource.set(key, list);
  }

  const grouped = [];
  for (const [, shares] of byResource) {
    const primary = shares[0];
    const allRecipients: any[] = [];
    const seen = new Set<string>();
    let lastAccessedAt: Date | null = primary.lastAccessedAt || null;
    let expiresAt: Date | null = primary.expiresAt || null;

    for (const share of shares) {
      for (const r of share.recipients || []) {
        const email = String(r.email || '').toLowerCase();
        if (!email || seen.has(email)) continue;
        if (
          ![
            ShareRecipientStatus.Pending,
            ShareRecipientStatus.Active,
            ShareRecipientStatus.Suspended,
          ].includes(r.status)
        ) {
          continue;
        }
        seen.add(email);
        allRecipients.push(r);
      }
      if (share.lastAccessedAt && (!lastAccessedAt || share.lastAccessedAt > lastAccessedAt)) {
        lastAccessedAt = share.lastAccessedAt;
      }
      if (share.expiresAt && (!expiresAt || share.expiresAt > expiresAt)) {
        expiresAt = share.expiresAt;
      }
    }

    const names = allRecipients.map((r) => r.displayName || r.email).filter(Boolean);
    const preview = names.slice(0, 2);
    grouped.push({
      id: primary._id.toString(),
      shareIds: shares.map((s: any) => s._id.toString()),
      resourceId: primary.resourceId?.toString?.(),
      itemName: primary.itemName,
      permission: primary.permission,
      permissionLabel: permissionLabel(primary.permission),
      status: primary.status,
      expiresAt,
      lastAccessedAt,
      recipientCount: allRecipients.length,
      activeRecipientCount: countActiveRecipients(allRecipients),
      recipientPreview: preview,
      recipientOverflow: Math.max(0, names.length - preview.length),
      recipients: allRecipients.map(toRecipientDto),
      createdAt: primary.createdAt,
      updatedAt: primary.updatedAt,
    });
  }

  grouped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return grouped;
};

export const listReceivedShares = async (userId: string, userEmail: string) => {
  const email = userEmail.toLowerCase().trim();
  const docs = await col()
    .find(
      activeShareFilter({
        status: { $in: [ShareStatus.Active, ShareStatus.Expired] },
        recipients: {
          $elemMatch: {
            $or: [{ userId: new ObjectId(userId) }, { email }],
            status: {
              $in: [
                ShareRecipientStatus.Pending,
                ShareRecipientStatus.Active,
                ShareRecipientStatus.Suspended,
              ],
            },
          },
        },
      }),
    )
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  return docs
    .map(maybeMarkExpired)
    .map((doc: any) => {
      const mine = (doc.recipients || []).find(
        (r: any) =>
          r.userId?.toString?.() === userId || String(r.email || '').toLowerCase() === email,
      );
      if (!mine) return null;
      if (doc.status === ShareStatus.Expired && mine.status !== ShareRecipientStatus.Active) {
        return null;
      }
      return {
        id: doc._id.toString(),
        resourceId: doc.resourceId?.toString?.(),
        itemName: doc.itemName,
        permission: doc.permission,
        permissionLabel: permissionLabel(doc.permission),
        status: doc.status,
        recipientStatus: mine.status,
        expiresAt: doc.expiresAt || null,
        lastAccessedAt: mine.lastAccessedAt || doc.lastAccessedAt || null,
        senderName: doc.senderName || 'Someone',
        senderEmail: doc.senderEmail,
        createdAt: doc.createdAt,
        canEdit: permissionLabel(doc.permission) === 'Can edit' && mine.status === ShareRecipientStatus.Active,
      };
    })
    .filter(Boolean);
};

export const getShareDetail = async (shareId: string, userId: string) => {
  if (!ObjectId.isValid(shareId)) {
    return { ok: false as const, error: { code: 'INVALID_SHARE', message: 'Invalid share id' } };
  }
  const doc = await col().findOne(
    activeShareFilter({ _id: new ObjectId(shareId), senderId: new ObjectId(userId) }),
  );
  if (!doc) {
    return { ok: false as const, error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } };
  }
  return { ok: true as const, share: toShareDetail(maybeMarkExpired(doc)) };
};

const findRecipientIndex = (recipients: any[], recipientKey: string) => {
  const key = String(recipientKey || '').trim().toLowerCase();
  return recipients.findIndex(
    (r) => r._id?.toString?.() === recipientKey || String(r.email || '').toLowerCase() === key,
  );
};

const persistRecipientMutation = async (
  shareId: string,
  senderId: string,
  recipientKey: string,
  mutate: (recipient: any) => void,
) => {
  if (!ObjectId.isValid(shareId)) {
    return { ok: false as const, error: { code: 'INVALID_SHARE', message: 'Invalid share id' } };
  }
  if (!String(recipientKey || '').trim()) {
    return {
      ok: false as const,
      error: { code: 'RECIPIENT_NOT_FOUND', message: 'Recipient id or email is required' },
    };
  }
  const doc = await col().findOne(
    activeShareFilter({ _id: new ObjectId(shareId), senderId: new ObjectId(senderId) }),
  );
  if (!doc) {
    return { ok: false as const, error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } };
  }
  const recipients = [...(doc.recipients || [])];
  const idx = findRecipientIndex(recipients, recipientKey);
  if (idx < 0) {
    return { ok: false as const, error: { code: 'RECIPIENT_NOT_FOUND', message: 'Recipient not found' } };
  }
  mutate(recipients[idx]);
  const activeRecipientCount = countActiveRecipients(recipients);
  const now = new Date();
  await col().updateOne(
    { _id: doc._id },
    {
      $set: {
        recipients,
        activeRecipientCount,
        updatedAt: now,
        updatedBy: new ObjectId(senderId),
      },
    },
  );
  const updated = await col().findOne({ _id: doc._id });
  return { ok: true as const, share: toShareDetail(updated) };
};

export const revokeRecipient = async (shareId: string, senderId: string, recipientKey: string) =>
  persistRecipientMutation(shareId, senderId, recipientKey, (r) => {
    r.status = ShareRecipientStatus.Revoked;
    r.revokedAt = new Date();
    r.suspendedAt = null;
  });

export const suspendRecipient = async (shareId: string, senderId: string, recipientKey: string) =>
  persistRecipientMutation(shareId, senderId, recipientKey, (r) => {
    r.status = ShareRecipientStatus.Suspended;
    r.suspendedAt = new Date();
    r.revokedAt = new Date();
  });

export const unsuspendRecipient = async (shareId: string, senderId: string, recipientKey: string) =>
  persistRecipientMutation(shareId, senderId, recipientKey, (r) => {
    if (r.status === ShareRecipientStatus.Suspended) {
      r.status = ShareRecipientStatus.Active;
      r.suspendedAt = null;
      r.revokedAt = null;
    }
  });

export const revokeAllAccess = async (shareId: string, senderId: string) => {
  if (!ObjectId.isValid(shareId)) {
    return { ok: false as const, error: { code: 'INVALID_SHARE', message: 'Invalid share id' } };
  }
  const doc = await col().findOne(
    activeShareFilter({ _id: new ObjectId(shareId), senderId: new ObjectId(senderId) }),
  );
  if (!doc) {
    return { ok: false as const, error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } };
  }
  const now = new Date();
  const recipients = (doc.recipients || []).map((r: any) => ({
    ...r,
    status: ShareRecipientStatus.Revoked,
    revokedAt: now,
    suspendedAt: null,
  }));
  await col().updateOne(
    { _id: doc._id },
    {
      $set: {
        recipients,
        status: ShareStatus.Revoked,
        revokedAt: now,
        activeRecipientCount: 0,
        updatedAt: now,
        updatedBy: new ObjectId(senderId),
      },
    },
  );
  const updated = await col().findOne({ _id: doc._id });
  return { ok: true as const, share: toShareDetail(updated) };
};

const findMyRecipient = (doc: any, userId: string, email: string) =>
  (doc.recipients || []).find(
    (r: any) =>
      r.userId?.toString?.() === userId || String(r.email || '').toLowerCase() === email.toLowerCase(),
  );

export const acceptShare = async (shareId: string, userId: string, userEmail: string) => {
  if (!ObjectId.isValid(shareId)) {
    return { ok: false as const, error: { code: 'INVALID_SHARE', message: 'Invalid share id' } };
  }
  const doc = await col().findOne(activeShareFilter({ _id: new ObjectId(shareId) }));
  if (!doc || doc.status !== ShareStatus.Active) {
    return { ok: false as const, error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } };
  }
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
    return { ok: false as const, error: { code: 'SHARE_EXPIRED', message: 'This share has expired' } };
  }
  const recipients = [...(doc.recipients || [])];
  const idx = recipients.findIndex(
    (r) =>
      r.userId?.toString?.() === userId ||
      String(r.email || '').toLowerCase() === userEmail.toLowerCase(),
  );
  if (idx < 0) {
    return { ok: false as const, error: { code: 'NOT_A_RECIPIENT', message: 'You are not a recipient of this share' } };
  }
  if (
    recipients[idx].status === ShareRecipientStatus.Revoked ||
    recipients[idx].status === ShareRecipientStatus.Suspended ||
    recipients[idx].status === ShareRecipientStatus.Declined
  ) {
    return { ok: false as const, error: { code: 'ACCESS_REVOKED', message: 'Access has been revoked' } };
  }
  recipients[idx].status = ShareRecipientStatus.Active;
  recipients[idx].acceptedAt = new Date();
  recipients[idx].userId = recipients[idx].userId || new ObjectId(userId);
  recipients[idx].isNovaSafeUser = true;
  const now = new Date();
  await col().updateOne(
    { _id: doc._id },
    {
      $set: {
        recipients,
        activeRecipientCount: countActiveRecipients(recipients),
        updatedAt: now,
      },
    },
  );
  return { ok: true as const, message: 'Share accepted' };
};

export const declineShare = async (shareId: string, userId: string, userEmail: string) => {
  if (!ObjectId.isValid(shareId)) {
    return { ok: false as const, error: { code: 'INVALID_SHARE', message: 'Invalid share id' } };
  }
  const doc = await col().findOne(activeShareFilter({ _id: new ObjectId(shareId) }));
  if (!doc) {
    return { ok: false as const, error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } };
  }
  const recipients = [...(doc.recipients || [])];
  const idx = recipients.findIndex(
    (r) =>
      r.userId?.toString?.() === userId ||
      String(r.email || '').toLowerCase() === userEmail.toLowerCase(),
  );
  if (idx < 0) {
    return { ok: false as const, error: { code: 'NOT_A_RECIPIENT', message: 'You are not a recipient of this share' } };
  }
  recipients[idx].status = ShareRecipientStatus.Declined;
  recipients[idx].revokedAt = new Date();
  const now = new Date();
  await col().updateOne(
    { _id: doc._id },
    {
      $set: {
        recipients,
        activeRecipientCount: countActiveRecipients(recipients),
        updatedAt: now,
      },
    },
  );
  return { ok: true as const, message: 'Share declined' };
};

/** Public / authenticated redeem of a non-user web link token. */
export const accessByToken = async (token: string) => {
  const accessToken = String(token || '').trim();
  if (!accessToken) {
    return { ok: false as const, error: { code: 'INVALID_TOKEN', message: 'Access token required' } };
  }
  const doc = await col().findOne(
    activeShareFilter({
      status: ShareStatus.Active,
      'recipients.accessToken': accessToken,
    }),
  );
  if (!doc) {
    return { ok: false as const, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access link' } };
  }
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
    await col().updateOne({ _id: doc._id }, { $set: { status: ShareStatus.Expired, updatedAt: new Date() } });
    return { ok: false as const, error: { code: 'SHARE_EXPIRED', message: 'This share has expired' } };
  }
  const recipients = [...(doc.recipients || [])];
  const idx = recipients.findIndex((r) => r.accessToken === accessToken);
  if (idx < 0) {
    return { ok: false as const, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access link' } };
  }
  const recipient = recipients[idx];
  if (
    recipient.status === ShareRecipientStatus.Revoked ||
    recipient.status === ShareRecipientStatus.Suspended ||
    recipient.status === ShareRecipientStatus.Declined
  ) {
    return { ok: false as const, error: { code: 'ACCESS_REVOKED', message: 'Access has been revoked' } };
  }

  const now = new Date();
  recipients[idx].lastAccessedAt = now;
  if (recipients[idx].status === ShareRecipientStatus.Pending) {
    recipients[idx].status = ShareRecipientStatus.Active;
    recipients[idx].acceptedAt = now;
  }
  await col().updateOne(
    { _id: doc._id },
    {
      $set: {
        recipients,
        lastAccessedAt: now,
        activeRecipientCount: countActiveRecipients(recipients),
        updatedAt: now,
      },
    },
  );

  return {
    ok: true as const,
    access: {
      shareId: doc._id.toString(),
      resourceId: doc.resourceId?.toString?.(),
      itemName: doc.itemName,
      permission: doc.permission,
      permissionLabel: permissionLabel(doc.permission),
      senderName: doc.senderName,
      senderEmail: doc.senderEmail,
      expiresAt: doc.expiresAt || null,
      recipientEmail: recipient.email,
      note: 'View this shared item via the secure NovaSafe web link.',
    },
  };
};

export const touchReceivedAccess = async (shareId: string, userId: string, userEmail: string) => {
  if (!ObjectId.isValid(shareId)) return;
  const doc = await col().findOne(activeShareFilter({ _id: new ObjectId(shareId) }));
  if (!doc) return;
  const recipients = [...(doc.recipients || [])];
  const mine = findMyRecipient({ recipients }, userId, userEmail);
  if (!mine) return;
  const idx = findRecipientIndex(recipients, mine._id.toString());
  if (idx < 0) return;
  const now = new Date();
  recipients[idx].lastAccessedAt = now;
  await col().updateOne(
    { _id: doc._id },
    { $set: { recipients, lastAccessedAt: now, updatedAt: now } },
  );
};
