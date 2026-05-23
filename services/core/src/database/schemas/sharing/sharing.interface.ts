import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';

export interface IShareRecord extends IBaseEntityDocument {
  senderId: Types.ObjectId;
  senderEmail?: string;
  senderName?: string;
  receiverId?: Types.ObjectId;
  receiverEmail: string;
  permission: string;
  resourceName: string;
  resourceId?: Types.ObjectId;
  source?: string;
}
