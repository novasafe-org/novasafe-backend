import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ModelRegistry } from '../../../database';
import type { ITwoFactorChallenge } from '../../../database/schemas/auth/auth.interface';
import { TWO_FACTOR_CHALLENGE_MODEL_NAME } from '../../../database/schemas/auth';

export class TwoFactorRepository {
  constructor(
    private readonly model: Model<ITwoFactorChallenge> = ModelRegistry.get<ITwoFactorChallenge>(
      TWO_FACTOR_CHALLENGE_MODEL_NAME,
    ),
  ) {}

  async createChallenge(data: {
    userId: Types.ObjectId;
    email: string;
    code: string;
    expiresAt: Date;
    source?: string;
  }): Promise<void> {
    await this.model.create({
      ...data,
      verified: false,
      createdAt: new Date(),
    });
  }

  async findValidChallenge(
    userId: Types.ObjectId,
    code: string,
  ): Promise<ITwoFactorChallenge | null> {
    return this.model
      .findOne({
        userId,
        code,
        verified: false,
        expiresAt: { $gt: new Date() },
      })
      .lean();
  }

  async markVerified(id: unknown): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { verified: true, verifiedAt: new Date() } });
  }
}

let twoFactorRepo: TwoFactorRepository | null = null;
export const getTwoFactorRepository = (): TwoFactorRepository => {
  if (!twoFactorRepo) twoFactorRepo = new TwoFactorRepository();
  return twoFactorRepo;
};
