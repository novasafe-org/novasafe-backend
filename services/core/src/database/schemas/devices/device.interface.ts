import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';

export interface ITrustedDevice extends IBaseEntityDocument {
  userId: Types.ObjectId;
  deviceKey: string;
  deviceName?: string;
  platform?: string;
  userAgent?: string;
  trusted: boolean;
  isPrimary: boolean;
  isActive: boolean;
  lastSeenAt?: Date;
  pushToken?: string;
  source?: string;
}
