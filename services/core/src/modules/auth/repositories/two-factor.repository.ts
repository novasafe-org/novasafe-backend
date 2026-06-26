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

  async invalidatePending(userId: Types.ObjectId): Promise<void> {
    await this.model.deleteMany({ userId, verified: false });
  }

  async createChallenge(data: {
    userId: Types.ObjectId;
    email: string;
    code: string;
    expiresAt: Date;
    source?: string;
  }): Promise<void> {
    await this.invalidatePending(data.userId);
    await this.model.create({
      ...data,
      verified: false,
      verifyAttempts: 0,
      createdAt: new Date(),
    });
  }

  async findActiveChallenge(userId: Types.ObjectId): Promise<ITwoFactorChallenge | null> {
    return this.model
      .findOne({
        userId,
        verified: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .lean();
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

  async incrementAttempts(id: unknown): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } },
    );
  }

  async markVerified(id: unknown): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { verified: true, verifiedAt: new Date() } });
  }

  async deleteChallenge(id: unknown): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }
}

let twoFactorRepo: TwoFactorRepository | null = null;
export const getTwoFactorRepository = (): TwoFactorRepository => {
  if (!twoFactorRepo) twoFactorRepo = new TwoFactorRepository();
  return twoFactorRepo;
};
