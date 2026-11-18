import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import type { SharePermission } from '../common/sharing-permission.schema';
import type { ShareRecipientStatus, ShareResourceType, ShareStatus } from './sharing.enums';

export interface IShareRecipient {
  _id: Types.ObjectId;
  email: string;
  userId?: Types.ObjectId | null;
  displayName?: string | null;
  isNovaSafeUser: boolean;
  accessToken?: string | null;
  status: ShareRecipientStatus | string;
  invitedAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
  suspendedAt?: Date | null;
  lastAccessedAt?: Date | null;
}

export interface IShareRecord extends IBaseEntityDocument {
  resourceId: Types.ObjectId;
  itemName: string;
  resourceType: ShareResourceType | string;
  senderId: Types.ObjectId;
  senderEmail?: string;
  senderName?: string;
  permission: SharePermission | string;
  recipients: IShareRecipient[];
  status: ShareStatus | string;
  expiresAt?: Date | null;
  lastAccessedAt?: Date | null;
  revokedAt?: Date | null;
  recipientCount: number;
  activeRecipientCount: number;
  source?: string;
  deleted?: boolean;
}
