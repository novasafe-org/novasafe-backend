import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import type { OtpPurpose } from './auth.enums';

export interface IOtpCode extends IBaseEntityDocument {
  email: string;
  purpose: OtpPurpose | string;
  code: string;
  expiresAt: Date;
  verifyAttempts?: number;
  lastSentAt?: Date;
}

export interface ITwoFactorChallenge extends IBaseEntityDocument {
  userId: Types.ObjectId;
  email: string;
  code: string;
  expiresAt: Date;
  verified: boolean;
  verifyAttempts?: number;
  source?: string;
}
