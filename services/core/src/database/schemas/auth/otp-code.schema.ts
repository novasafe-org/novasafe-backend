import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { OtpPurpose } from './auth.enums';
import type { IOtpCode } from './auth.interface';

const otpDefinition = {
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, required: true, enum: Object.values(OtpPurpose) },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifyAttempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
};

export const OtpCodeSchema = createBaseSchema(otpDefinition);

OtpCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
OtpCodeSchema.index({ expiresAt: 1 });

export const OTP_CODE_MODEL_NAME = 'OtpCode';
export const OTP_CODE_COLLECTION = COLLECTIONS.otpCodes;

export type { IOtpCode };
