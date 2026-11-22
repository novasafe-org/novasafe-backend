import type { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import {
  acceptShare,
  accessByToken,
  createShares,
  declineShare,
  findOwnedItemIdByTitle,
  getShareDetail,
  listReceivedShares,
  listSentShares,
  resolveRecipients,
  revokeAllAccess,
  revokeRecipient,
  suspendRecipient,
  touchReceivedAccess,
  unsuspendRecipient,
} from '../services/sharing.service';

const requireUser = (req: Request): { id: string; email: string; name: string } | null => {
  const id = req.user?.id;
  if (!id || !ObjectId.isValid(id)) return null;
  return {
    id,
    email: req.user?.email || '',
    name: req.user?.name || req.user?.email || 'NovaSafe User',
  };
};

const source = (req: Request) => req.source || 'mobile';

const shareErrorStatus = (code: string): number => {
  if (code === 'ACCESS_REVOKED') return 403;
  if (code === 'SHARE_EXPIRED') return 410;
  if (code === 'SHARE_NOT_FOUND' || code === 'INVALID_TOKEN') return 404;
  return 400;
};

export const resolveShareRecipients = async (req: Request, res: Response): Promise<void> => {
  if (!requireUser(req)) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await resolveRecipients(req.body?.emails ?? req.body?.recipientEmails);
  if (!result.ok) {
    res.status(400).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), recipients: result.recipients });
};

export const createShare = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const body = req.body || {};
  const resourceIds: string[] = Array.isArray(body.resourceIds)
    ? body.resourceIds
    : body.resourceId
      ? [body.resourceId]
      : [];
  const recipientEmails: string[] = Array.isArray(body.recipientEmails)
    ? body.recipientEmails
    : body.recipientEmail
      ? [body.recipientEmail]
      : [];

  const result = await createShares({
    senderId: user.id,
    senderEmail: user.email,
    senderName: user.name,
    resourceIds,
    recipientEmails,
    permissionRaw: body.permission,
    expiresInDaysRaw: body.expiresInDays,
    source: source(req),
  });

  if (!result.ok) {
    const status =
      result.error.code === 'ITEM_NOT_FOUND'
        ? 404
        : result.error.code === 'TOO_MANY_RECIPIENTS'
          ? 400
          : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }

  res.status(201).json({
    success: true,
    source: source(req),
    message: result.message,
    shares: result.shares,
    expiresInDays: result.expiresInDays,
  });
};

/** Legacy alias — maps old body shape onto createShare (supports itemName without resourceId). */
export const sendShareInvite = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const body = req.body || {};
  let resourceId = body.resourceId;
  const resourceIds: string[] = Array.isArray(body.resourceIds) ? [...body.resourceIds] : [];
  if (!resourceId && resourceIds.length === 0 && body.itemName) {
    const foundId = await findOwnedItemIdByTitle(user.id, String(body.itemName));
    if (!foundId) {
      res.status(404).json({
        success: false,
        code: 'ITEM_NOT_FOUND',
        message: 'No vault item found matching itemName. Pass resourceId instead.',
      });
      return;
    }
    resourceId = foundId;
  }
  req.body = {
    ...body,
    resourceId,
    resourceIds: resourceIds.length ? resourceIds : undefined,
    recipientEmails: body.recipientEmails || (body.recipientEmail ? [body.recipientEmail] : []),
    permission: body.permission,
    expiresInDays: body.expiresInDays ?? 7,
  };
  await createShare(req, res);
};

export const listShares = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const type = String(req.query.type || 'sent').toLowerCase();
  if (type === 'received') {
    const shares = await listReceivedShares(user.id, user.email);
    res.status(200).json({ success: true, source: source(req), shares });
    return;
  }
  const status =
    req.query.status != null && String(req.query.status).trim() !== ''
      ? String(req.query.status)
      : undefined;
  const shares = await listSentShares(user.id, { status });
  res.status(200).json({ success: true, source: source(req), shares });
};

export const getShare = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await getShareDetail(req.params.shareId, user.id);
  if (!result.ok) {
    res.status(404).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), share: result.share });
};

export const revokeShareRecipient = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const key = req.params.recipientId || req.body?.email || req.body?.recipientId;
  const result = await revokeRecipient(req.params.shareId, user.id, String(key || ''));
  if (!result.ok) {
    const status = result.error.code === 'SHARE_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: 'Recipient access revoked', share: result.share });
};

export const suspendShareRecipient = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const key = req.params.recipientId || req.body?.email || req.body?.recipientId;
  const result = await suspendRecipient(req.params.shareId, user.id, String(key || ''));
  if (!result.ok) {
    const status = result.error.code === 'SHARE_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: 'Recipient access suspended', share: result.share });
};

export const unsuspendShareRecipient = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const key = req.params.recipientId || req.body?.email || req.body?.recipientId;
  const result = await unsuspendRecipient(req.params.shareId, user.id, String(key || ''));
  if (!result.ok) {
    const status = result.error.code === 'SHARE_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: 'Recipient access restored', share: result.share });
};

export const revokeShareAll = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await revokeAllAccess(req.params.shareId, user.id);
  if (!result.ok) {
    res.status(404).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({
    success: true,
    source: source(req),
    message: 'All access revoked',
    share: result.share,
  });
};

export const acceptShareInvite = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await acceptShare(req.params.shareId, user.id, user.email);
  if (!result.ok) {
    res.status(shareErrorStatus(result.error.code)).json({
      success: false,
      code: result.error.code,
      message: result.error.message,
    });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: result.message });
};

export const declineShareInvite = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await declineShare(req.params.shareId, user.id, user.email);
  if (!result.ok) {
    const status = result.error.code === 'SHARE_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: result.error.code, message: result.error.message });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: result.message });
};

export const openReceivedShare = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const result = await touchReceivedAccess(req.params.shareId, user.id, user.email);
  if (!result.ok) {
    res.status(shareErrorStatus(result.error.code)).json({
      success: false,
      code: result.error.code,
      message: result.error.message,
    });
    return;
  }
  res.status(200).json({ success: true, source: source(req), message: 'Access recorded' });
};

export const publicAccessByToken = async (req: Request, res: Response): Promise<void> => {
  const result = await accessByToken(req.params.token);
  if (!result.ok) {
    res.status(shareErrorStatus(result.error.code)).json({
      success: false,
      code: result.error.code,
      message: result.error.message,
    });
    return;
  }
  res.status(200).json({ success: true, access: result.access });
};
