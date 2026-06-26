import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import type { ITwoFactorChallenge } from './auth.interface';

const twoFactorDefinition = {
  ...userIdField,
  email: { type: String, required: true, lowercase: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false },
  verifyAttempts: { type: Number, default: 0 },
  ...sourceField,
};

export const TwoFactorChallengeSchema = createBaseSchema(twoFactorDefinition);

TwoFactorChallengeSchema.index({ userId: 1, verified: 1, expiresAt: -1 });
TwoFactorChallengeSchema.index({ email: 1, expiresAt: 1 });

export const TWO_FACTOR_CHALLENGE_MODEL_NAME = 'TwoFactorChallenge';
export const TWO_FACTOR_CHALLENGE_COLLECTION = COLLECTIONS.twoFactorChallenges;

export type { ITwoFactorChallenge };
