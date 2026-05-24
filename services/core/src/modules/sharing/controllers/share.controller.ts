import { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';
import { sendShareInviteEmail } from '../../auth/services/email.service';

const db = getNativeMongo();

export const listShares = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId || !ObjectId.isValid(userId)) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const type = String(req.query.type || 'sent');
  const userObjectId = new ObjectId(userId);
  const query = type === 'received' ? { receiverId: userObjectId } : { senderId: userObjectId };
  const shares = await db.findMany(COLLECTIONS.shareRecords, query, { sort: { createdAt: -1 }, limit: 50 });
  const mapped = shares.map((s: any) => ({
    id: s._id?.toString?.(),
    senderName: s.senderName || 'You',
    senderEmail: s.senderEmail || req.user?.email,
    permission: s.permission || 'Viewer',
    resourceName: s.resourceName || 'Vault item',
    createdAt: s.createdAt,
  }));
  res.status(200).json({ success: true, source: req.source, shares: mapped });
};

export const sendShareInvite = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId || !ObjectId.isValid(userId)) return void res.status(401).json({ success: false, message: 'Authentication required' });
  const senderEmail = req.user?.email || '';
  const senderName = req.user?.name || senderEmail || 'NovaSafe User';
  const { recipientEmail, itemName, permission } = req.body || {};
  if (!recipientEmail || !itemName) {
    return void res.status(400).json({ success: false, message: 'recipientEmail and itemName are required' });
  }

  const userObjectId = new ObjectId(userId);
  const record = {
    senderId: userObjectId,
    senderEmail,
    senderName,
    receiverEmail: String(recipientEmail).toLowerCase().trim(),
    permission: permission || 'Viewer',
    resourceName: itemName,
    createdAt: new Date(),
    source: 'mobile',
  };
  await db.insertOne(COLLECTIONS.shareRecords, record);
  await sendShareInviteEmail(record.receiverEmail, senderName, itemName, record.permission);

  res.status(201).json({ success: true, source: req.source, message: 'Share invite sent', data: record });
};
