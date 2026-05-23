import type { Model } from 'mongoose';
import type { IOtpCode, ITwoFactorChallenge } from './auth.interface';

export const AUTH_INDEX_SPECS = {
  otpCodes: [
    { key: { email: 1, purpose: 1 }, unique: true },
    { key: { expiresAt: 1 } },
  ],
  twoFactorChallenges: [
    { key: { userId: 1, verified: 1, expiresAt: -1 } },
    { key: { email: 1, expiresAt: 1 } },
  ],
} as const;

export const applyAuthIndexes = async (
  otpModel: Model<IOtpCode>,
  twoFactorModel: Model<ITwoFactorChallenge>,
): Promise<void> => {
  await Promise.all([otpModel.syncIndexes(), twoFactorModel.syncIndexes()]);
};
